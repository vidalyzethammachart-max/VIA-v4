# Qwen for Analyze Video only

The user approved Qwen on 2026-10-23, then explicitly limited changes to the failing video analysis step. This change uses the same extracted MP3, sampled JPEGs and response contract as before. It does not change R2 uploads, evaluations, aggregation, direct dispatch, n8n report nodes or document callbacks. Existing n8n report generation still uses its existing provider and credentials.

## Server configuration

Create a Model Studio API key in your account, confirm model availability and quota, and copy the matching region/workspace Chat Completions base URL from the console. No account, billing or subscription changes have been made by this implementation.

```dotenv
VIDEO_ANALYSIS_PROVIDER=qwen
DASHSCOPE_API_KEY=<server-only key>
DASHSCOPE_BASE_URL=<matching regional base URL ending /compatible-mode/v1>
QWEN_MODEL=qwen3.8-omni-flash
```

Put these in the ignored local `.env` for a local backend, or server-side secrets/environment for Cloud Run. Never use `VITE_` prefixes or put keys in n8n node expressions, git or chat. Editing the local `.env` does not configure the deployed backend. The frontend currently calls a remote backend.

This adapter targets Qwen3.8 Omni's non-streaming JSON mode. Other Qwen model families have different API capabilities and are deliberately rejected. The key, model access and endpoint must match; copying a Beijing example for a Singapore key will not work. The adapter sends audio and images in separate calls and does not send R2 signed URLs to Qwen. Missing audio is stated explicitly. Inline audio above the provider limit fails rather than being discarded.

## Checks

```sh
node scripts/check-qwen.mjs
# Explicit potentially billable synthetic text/JSON check:
node scripts/check-qwen.mjs --generate
```

The first command only checks local configuration. Neither command creates a saved evaluation. Unit/integration tests mock the external AI response; actual ffmpeg extraction is exercised. A text connectivity check does not prove audio/image quality or document generation.

Before accepting live behavior, deploy these server files to the backend used by the n8n Analyze Video node, set the server-only variables, then verify with synthetic media and an inspected retry of the existing evaluation. Keep existing R2 and service-authentication settings. Do not switch general production traffic just to test a revision. Do not resubmit the whole evaluation or automatically replay jobs with uncertain delivery.

Known existing failure: evaluation #261 / n8n execution 3044 failed with OpenAI credit exhaustion and is recorded failed. No Qwen request or retry of this evaluation has been made by this implementation. The separate case aggregation endpoints still require their existing OpenAI configuration and quota, per the requested scope.

No automatic provider fallback or request retry is enabled. Unknown network/server outcomes preserve the cache lock and require inspection before replay. Validated outputs are cached with endpoint, model and credential scope; only an explicit setting `VIDEO_ANALYSIS_PROVIDER=openai` restores the old video analysis provider.

## References

- [Qwen Omni API and media/JSON examples](https://help.aliyun.com/en/model-studio/qwen-omni)
- [Create a Model Studio API key](https://www.alibabacloud.com/help/en/model-studio/get-api-key)
