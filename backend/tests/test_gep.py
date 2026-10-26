import asyncio
import logging
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from openai import AsyncOpenAI
from app.core.config import Settings
from app.providers.base import ProviderError
from app.providers.openai_provider import OpenAIProvider
from app.schemas import AnalysisRequest

BASE = "https://openai.generative.engine.capgemini.com/v1"

def settings(**kwargs):
    return Settings(generative_engine_api_key="dummy-test-secret", generative_engine_model="studio-test-model", _env_file=None, **{"generative_engine_base_url": BASE, **kwargs})

@pytest.mark.parametrize("status,upstream_code,expected", [
    (401,"invalid_api_key","authentication_error"),
    (403,"permission_denied","access_denied"),
    (404,"model_not_found","unsupported_model_or_endpoint"),
    (405,"unsupported_endpoint","unsupported_model_or_endpoint"),
    (400,"invalid_request_error","unsupported_request"),
    (422,"unsupported_parameter","unsupported_request"),
    (429,"insufficient_quota","quota_or_rate_limit"),
    (503,"server_error","gateway_failure"),
    (504,"server_error","gateway_failure"),
    (500,"dummy-test-secret\nAuthorization: private","gateway_failure"),
])
def test_real_sdk_offline_http_errors(status, upstream_code, expected, caplog):
    def handler(request):
        assert str(request.url)==BASE+"/chat/completions"
        assert request.headers['authorization']=='Bearer dummy-test-secret'
        return httpx.Response(status,json={"error":{"code":upstream_code,"message":"dummy-test-secret private story Authorization: hidden"}})
    def factory(**kwargs):
        assert kwargs['base_url']==BASE
        assert kwargs['api_key']=='dummy-test-secret'
        assert kwargs['timeout']==60
        return AsyncOpenAI(**kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with caplog.at_level(logging.WARNING), patch('app.providers.openai_provider.AsyncOpenAI',side_effect=factory):
        with pytest.raises(ProviderError) as error:
            asyncio.run(OpenAIProvider(settings()).analyze(AnalysisRequest(user_story='private story')))
    assert error.value.code==expected
    assert f'status={status}' in caplog.text
    for sensitive in ('dummy-test-secret','private story','Authorization','hidden'):
        assert sensitive not in caplog.text
        assert sensitive not in error.value.message

@pytest.mark.parametrize('kind,expected', [('timeout','timeout'),('network','gateway_connection_error')])
def test_transport_errors(kind,expected,caplog):
    def handler(request):
        if kind=='timeout':
            raise httpx.ReadTimeout('dummy-test-secret',request=request)
        raise httpx.ConnectError('dummy-test-secret',request=request)
    def factory(**kwargs):
        return AsyncOpenAI(**kwargs,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with caplog.at_level(logging.WARNING), patch('app.providers.openai_provider.AsyncOpenAI',side_effect=factory):
        with pytest.raises(ProviderError) as error:
            asyncio.run(OpenAIProvider(settings()).analyze(AnalysisRequest(user_story='private story')))
    assert error.value.code==expected
    assert 'dummy-test-secret' not in caplog.text

@pytest.mark.parametrize('base',["https://example.com/v1", BASE+'?token=secret', 'http://openai.generative.engine.capgemini.com/v1',
    'https://gateway.capgemini.com/v2/llm/invoke', 'https://user:password@gateway.capgemini.com/v1',
    BASE+'/responses', 'https://capgemini.com.attacker.example/v1', 'https://[invalid'])
def test_key_never_sent_to_other_hosts(base):
    provider=OpenAIProvider(settings(generative_engine_base_url=base))
    assert not provider.enabled
    with patch('app.providers.openai_provider.AsyncOpenAI') as client:
        with pytest.raises(ProviderError):
            asyncio.run(provider.analyze(AnalysisRequest(user_story='reset')))
        client.assert_not_called()

def test_missing_model_stays_unconfigured_and_secret_repr_hidden():
    config=Settings(generative_engine_api_key='dummy-test-secret',_env_file=None)
    assert not OpenAIProvider(config).enabled
    assert 'dummy-test-secret' not in repr(config)

@pytest.mark.parametrize('key,model', [
    ('replace_me_locally', 'studio-test-model'),
    ('dummy-test-secret', 'replace_with_enabled_GEP_model'),
])
def test_placeholder_configuration_never_calls_gateway(key, model):
    config = Settings(generative_engine_api_key=key, generative_engine_model=model, _env_file=None)
    with patch('app.providers.openai_provider.AsyncOpenAI') as client:
        with pytest.raises(ProviderError) as error:
            asyncio.run(OpenAIProvider(config).analyze(AnalysisRequest(user_story='reset')))
        assert error.value.code == 'configuration_error'
        client.assert_not_called()

def test_file_settings_from_explicit_safe_fixture(tmp_path):
    env=tmp_path/'.env'
    env.write_text('GENERATIVE_ENGINE_API_KEY=fixture-only\nGENERATIVE_ENGINE_MODEL=fixture-model\nLLM_TIMEOUT_SECONDS=25\n')
    # Environment has higher priority; temporarily clear only test-owned variables.
    import os
    with patch.dict(os.environ,{},clear=True):
        config=Settings(_env_file=env)
    assert config.generative_engine_model=='fixture-model'
    assert config.generative_engine_api_key.get_secret_value()=='fixture-only'
    assert config.llm_timeout_seconds==25

@pytest.mark.parametrize('status', [500,502,503,504])
def test_transient_failures_retry_once_and_return_safe_message(status, caplog):
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(status,json={"error":{"code":"server_error","message":"private story dummy-test-secret"}})
    def factory(**kwargs):
        assert kwargs['max_retries']==0
        return AsyncOpenAI(**kwargs,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with caplog.at_level(logging.WARNING), patch('app.providers.openai_provider.AsyncOpenAI',side_effect=factory), patch('app.providers.openai_provider.asyncio.sleep',new_callable=AsyncMock) as delay:
        with pytest.raises(ProviderError) as error:
            asyncio.run(OpenAIProvider(settings()).analyze(AnalysisRequest(user_story='private story')))
    assert len(calls)==2
    delay.assert_awaited_once_with(0.5)
    assert error.value.message=='GEP is temporarily unavailable; please retry'
    assert error.value.status==503
    assert caplog.text.count(f'GEP upstream status={status} code=server_error')==2
    assert 'private story' not in caplog.text
    assert 'dummy-test-secret' not in caplog.text

@pytest.mark.parametrize('status,code', [(401,'invalid_api_key'),(403,'permission_denied'),(404,'model_not_found'),(500,'invalid_api_key'),(502,'permission_denied'),(503,'unsupported_model'),(504,'unsupported_endpoint'),(400,'unsupported_parameter')])
def test_configuration_and_access_errors_are_never_retried(status,code):
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(status,json={'error':{'code':code,'message':'private'}})
    def factory(**kwargs):
        return AsyncOpenAI(**kwargs,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with patch('app.providers.openai_provider.AsyncOpenAI',side_effect=factory), patch('app.providers.openai_provider.asyncio.sleep',new_callable=AsyncMock) as delay:
        with pytest.raises(ProviderError):
            asyncio.run(OpenAIProvider(settings()).analyze(AnalysisRequest(user_story='private story')))
    assert len(calls)==1
    delay.assert_not_awaited()

def test_gep_500_then_success_preserves_request_and_parses_result():
    import json
    from app.schemas import SECTIONS
    calls=[]
    output={**{section:[] for section in SECTIONS},'story_assessment':{'complexity_score':2,'complexity_reasons':['Simple workflow'],'readiness_score':3,'readiness_gaps':['Clarify errors']}}
    def handler(request):
        calls.append(json.loads(request.content))
        assert str(request.url)==BASE+'/chat/completions'
        if len(calls)==1:
            return httpx.Response(500,json={'error':{'code':'server_error','message':'private'}})
        return httpx.Response(200,json={'id':'test','object':'chat.completion','created':0,'model':'studio-test-model','choices':[{'index':0,'finish_reason':'stop','message':{'role':'assistant','content':json.dumps(output)}}]})
    def factory(**kwargs):
        return AsyncOpenAI(**kwargs,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with patch('app.providers.openai_provider.AsyncOpenAI',side_effect=factory), patch('app.providers.openai_provider.asyncio.sleep',new_callable=AsyncMock) as delay:
        result=asyncio.run(OpenAIProvider(settings()).analyze(AnalysisRequest(user_story='private story')))
    assert len(calls)==2 and calls[0]==calls[1]
    assert calls[0]['model']=='studio-test-model'
    assert calls[0]['temperature']==0
    assert [message['role'] for message in calls[0]['messages']]==['system','user']
    assert result.story_assessment.complexity_label=='Low'
    delay.assert_awaited_once_with(0.5)

def test_mocked_gep_500_reaches_ui_as_safe_api_error():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.routes import get_providers
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(500,json={'error':{'code':'server_error','message':'private story dummy-test-secret'}})
    def factory(**kwargs):
        return AsyncOpenAI(**kwargs,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    previous=app.dependency_overrides.copy()
    app.dependency_overrides[get_providers]=lambda:{'openai':OpenAIProvider(settings())}
    try:
        with patch('app.providers.openai_provider.AsyncOpenAI',side_effect=factory), patch('app.providers.openai_provider.asyncio.sleep',new_callable=AsyncMock):
            with TestClient(app) as client:
                response=client.post('/api/v1/analyze',json={'user_story':'private story'})
        assert len(calls)==2
        assert response.status_code==503
        assert response.json()=={'error':{'code':'gateway_failure','message':'GEP is temporarily unavailable; please retry'}}
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
