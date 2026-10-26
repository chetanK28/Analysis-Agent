# Requirement Analysis Agent

A React + FastAPI proof of concept that turns a story into five editable analysis sections using Capgemini GEP with the OpenAI-compatible SDK. Every response is a **draft for human review**. No database or fake LLM output is used.

## Prerequisites

Windows PowerShell, Python 3.12+ and Node.js 22.12+ (Node 24 LTS recommended) with npm. Install Python from python.org and Node LTS from nodejs.org, then reopen PowerShell. Check `py -3.12 --version` and `node --version`.

## Setup (PowerShell)

From the workspace:

```powershell
cd C:\Users\CHETAN\Desktop\POC\requirement-agent\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

In the existing `backend/.env`, set these backend-only settings (do not overwrite an existing file with `.env.example`):

```text
GENERATIVE_ENGINE_API_KEY=<your-company-gateway-key>
GENERATIVE_ENGINE_BASE_URL=replace_with_OpenAI_API_reference_server_URL
GENERATIVE_ENGINE_MODEL=<exact-enabled-model-id-from-GEP-Studio>
LLM_TIMEOUT_SECONDS=60
```

The model intentionally has no default. `openai.gpt-5-nano` appeared only as an example in the slides described by the user; use it only if enabled for your GEP Studio. Old `OPENAI_API_KEY`/`OPENAI_MODEL` settings are ignored. No automatic model, endpoint or provider fallback occurs. Never put the gateway key in frontend settings, source, logs or Git. Restart the backend after changing settings. Without a key or model, startup still works and Analyze reports a configuration error.

The existing operation remains **Responses API**: `client.responses.parse`, sending `POST <OpenAI-reference-server-URL>/responses`, the existing Pydantic `Analysis` JSON schema and `store=False`. No GEP starter-kit configuration or company setup slides were present in the repository, so gateway operation support and account-specific model availability are **unconfirmed**. The supplied base URL alone does not confirm Responses support. Before using the app, check your GEP Studio starter-kit sample/API documentation for:

- The exact model ID enabled for your Studio and the key's access permissions.
- Support for Responses API (`POST /v1/responses`), strict structured JSON-schema output, and `store=False` for that model.
- Whether the starter kit instead documents only Chat Completions (`POST /v1/chat/completions`). If Responses is unsupported, provide that non-secret sample so the adapter can be changed explicitly while preserving the analysis schema. The app does not silently switch.
- Key activation, quota/budget, and required corporate network/VPN access.

No live GEP calls were made during this update. No real `.env` values were read or changed. Tests use synthetic configuration and mocked HTTP transports.

In a second PowerShell terminal:

```powershell
cd C:\Users\CHETAN\Desktop\POC\requirement-agent\frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd install
```

## Start (two terminals)

Backend:

```powershell
cd C:\Users\CHETAN\Desktop\POC\requirement-agent\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host localhost --port 8000
```

Frontend:

```powershell
cd C:\Users\CHETAN\Desktop\POC\requirement-agent\frontend
.\start.cmd
```

Open http://localhost:5173. API documentation: http://localhost:8000/docs. Health: http://localhost:8000/health. `npm.cmd` avoids PowerShell script execution-policy restrictions; virtual environment activation is unnecessary.

If `npm.cmd` is not recognized in an existing VS Code terminal, use `start.cmd` as above. It adds the installed Node.js directory to its own PATH before starting Vite. Alternatively, close all VS Code windows and reopen VS Code after installing Node.js.

Click **Load example**, or enter:

> As a registered customer, I want to reset my password using my verified email address so that I can regain access to my account.

Select the configured provider and click Analyze. Review all five sections, source evidence, and explicit/inferred labels. Edit titles and descriptions and choose pending, accepted, or rejected. Download JSON or Markdown to preserve decisions. Refreshing loses results and edits. New analysis replaces the prior draft, so export it first.

## Checks (no API key needed)

```powershell
cd C:\Users\CHETAN\Desktop\POC\requirement-agent\backend
.\.venv\Scripts\python.exe -m pytest -q
cd ..\frontend
npm.cmd test
npm.cmd run build
```

Tests mock provider/SDK calls, covering validation, ID repair, evidence, empty sections, provider errors, CORS, timeout, form loading/errors, review editing, and exports. Tests never use real LLM output.

## API and configuration

- `GET /health`: process health; does not check the provider.
- `GET /api/v1/providers`: IDs, configured models, and enabled flags; no keys.
- `POST /api/v1/analyze`: `user_story`, optional `acceptance_criteria` and `context`, and `provider` (default `openai`). Each source field is limited to 12,000 characters.
- Response: provider/model metadata, `status: draft`, validation warnings, and `analysis` with all five sections. Every finding has ID, title, description, evidence array, and explicit/inferred classification.
- `LLM_TIMEOUT_SECONDS` defaults to 60 (maximum 180). At most one retry after 0.5 seconds for transient upstream HTTP 500/502/503/504 errors; no provider switching. Authentication, permission, unsupported-model and other known non-transient error codes are never retried.
- `CORS_ORIGIN` defaults to exactly `http://localhost:5173`. For production, set it to the actual HTTPS frontend origin and rebuild with `VITE_API_URL` pointing to your deployed backend. CORS is not authentication. Add authentication, authorization, TLS, request limits, and operational controls before public deployment.

## Add a provider

Implement `Provider` in `backend/app/providers/base.py`: `name`, `model`, `enabled`, and async `analyze(request) -> Analysis`. Read its secrets/model from backend Settings. Validate output and translate errors to `ProviderError`. Register the instance in `get_providers` in `app/api/routes.py`. The UI discovers providers automatically; the request/response API stays unchanged. Add mocked adapter tests. Gemini is deliberately deferred until its adapter can be tested.

## Design and limitations

The GEP adapter uses the supported Python SDK `AsyncOpenAI.responses.parse` with a Pydantic schema, as documented in the [official structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). The backend validates the response again, repairs invalid/duplicate IDs deterministically, checks exact evidence substrings against story/acceptance criteria, and downgrades unsupported explicit claims to inferred. Context-only evidence cannot make a claim explicit. Supported quotes do not prove semantic correctness; human review remains essential.

The versioned system prompt treats story text as untrusted data and prohibits invented business rules and numeric NFR thresholds. Prompt injection and hallucinations cannot be eliminated by prompting or substring checks. Validate meaning, missing constraints, and numbers yourself. Edits are reviewer annotations; evidence and classification remain those of the original analysis. Stable IDs are deterministic for the same ordered response; separate LLM runs can vary.

No persistence, authentication, cross-user collaboration, automatic approval, or production deployment is included. The backend does not log stories or keys. Submitted text is sent to Capgemini GEP; `store=False` is used, but applicable provider data policies still apply. Live analysis requires a valid key, quota, network connectivity, and model access. The model must be explicitly configured and is never silently substituted.

## Diagnose AI Passport Gateway authentication/access

No Gateway screenshots or OpenAI API reference were available in the repository/attachments for this update. The earlier server URL is no longer a built-in default. Do not infer a server URL from the REST API reference or use `/v2/llm/invoke` with this adapter.

In AI Passport Gateway, open **OpenAI API reference** (not REST API reference). Copy the selected **Servers** URL exactly into `GENERATIVE_ENGINE_BASE_URL`. Copy the authentication header name and scheme from its **Authorize / Security** section or generated OpenAI-compatible example. Do not share a credential-bearing example. This adapter currently uses the OpenAI SDK's `Authorization: Bearer <key>` behavior. That behavior is not verified against your GEP reference; if the reference specifies something else, provide only the non-secret header name/scheme and server URL so the adapter can be adjusted without guessing.

Open **GEP Models Catalog**, select the intended Studio, and copy the exact enabled model identifier into `GENERATIVE_ENGINE_MODEL`. No model is assumed. Verify the model supports the Responses endpoint and structured output. No operation fallback is implemented; if the company reference documents only Chat Completions, the adapter needs an explicit change after that reference is available.

401 and 403 are distinct: 401 prompts checks of server/authentication/key validity; 403 prompts checks of Studio access, key permissions, model entitlements and network policy. These statuses alone do not establish the root cause. Logs contain numeric status, allowlisted upstream codes and fixed safe descriptions; arbitrary upstream messages, request headers and keys are never copied into diagnostics.

The backend accepts only HTTPS server URLs on Capgemini subdomains, without embedded credentials/query strings, and rejects known REST invoke and operation URLs. If the documented OpenAI server uses another company-approved domain, adjust the host policy only after verifying that reference.
## Story Assessment and reviewer feedback

After the five analysis sections, Story Assessment shows complexity and readiness
scores (1?5), labels, complexity reasons, and missing or ambiguous details. The model
assesses the original story, acceptance criteria, and context using the guides in
`backend/app/prompts/analysis_v1.txt`; scores are AI estimates requiring human review.
Complexity labels map 1?2 to Low, 3 to Moderate, 4 to High, and 5 to Very high.
Readiness labels map 1?2 to Needs work, 3 to Needs clarification, 4 to Mostly clear,
and 5 to Ready for review.

The API returns `story_assessment` alongside the existing `analysis`. The model
must supply both scores, complexity reasons, and readiness gaps. Labels are generated
by the backend using `backend/app/assessment_labels.json`, also imported by the
frontend types. Model-supplied labels are ignored. Whole-number strings and decimals
are accepted only within 1?5; fractional scores and booleans are rejected. Missing
content returns a safe `invalid_output` error naming the field. Complete JSON code
fences are removed before parsing; document text is never included in errors. Older frontend results
without an assessment show an unavailable message rather than invented scores.

Submit a 1?5 usefulness rating and optional comment below the assessment. Feedback
is kept with the current draft in memory, just like review edits, and included in
both JSON (`feedback`) and Markdown downloads. Refreshing or starting another
analysis clears it. No database or feedback network request is added.

To try: restart the backend, run `frontend/start.cmd`, analyze a story with optional
acceptance criteria/context, scroll below the findings, submit feedback, and download
either report format. The active adapter uses Chat Completions with validated JSON;
the older Responses API descriptions above do not describe the current adapter.
Raw model content is neither logged nor included in validation errors.

GEP temporary failures: the active Chat Completions adapter makes at most two
attempts (one retry after 0.5 seconds), within the existing overall analysis timeout.
The SDK's built-in retries remain disabled. Each failed attempt logs the upstream
numeric status and an allowlisted error code, without raw upstream messages or
source documents. Persistent transient 500/502/503/504 failures return HTTP 503 with
`GEP is temporarily unavailable; please retry`, which the existing UI displays.
A 500 alone does not confirm model entitlement or request compatibility; verify the
configured model supports Chat Completions and `temperature=0` in your GEP reference.

## PDF and Word document analysis

Manual entry keeps its existing Analyze button. The separate **Document analysis**
section supports text-based PDF and Word DOCX files up to 10 MB, with a maximum of
12,000 extracted characters. Uploading extracts and previews text only; it does not
call GEP. Expand **Preview and edit extracted text** to correct the text, then click
**Analyze document** to send it to the selected provider through the existing analysis
endpoint. That button also reruns analysis after edits.

**Retry** repeats extraction after an upload/read failure, or repeats analysis without
uploading again after an analysis failure. Choosing another file replaces the current
document and prevents older requests from replacing its text or result. Analysis of
the new document requires another click on **Analyze document**.

`POST /api/v1/documents/extract` accepts multipart field `file` and returns
`{filename, text}`. Files remain in memory and are not retained. Extraction uses pypdf
and python-docx, including DOCX tables. Legacy `.doc`, corrupt/protected documents,
invalid types/signatures, oversized files/text, and files with no selectable text
receive clear errors. OCR and database storage are not included.

From the repository root, run the backend in one terminal:

```powershell
cd .\backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host localhost --port 8000
```

From the repository root in a second terminal:

```powershell
cd .\frontend
.\start.cmd
```

Open http://localhost:5173, upload a PDF or DOCX under **Document analysis**, review
the extracted text, then click **Analyze document**. The result uses the existing
analysis layout, assessment, review controls, feedback, and exports.
