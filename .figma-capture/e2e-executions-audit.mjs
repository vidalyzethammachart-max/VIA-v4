import "../server/loadEnv.js";
const base = new URL(process.env.N8N_WEBHOOK_URL);
base.pathname = "/api/v1/executions";
base.search = new URLSearchParams({workflowId:"nl38M3CrQPQXpg0G",limit:"10",includeData:"false"}).toString();
const response = await fetch(base, { headers:{"X-N8N-API-KEY":process.env.N8N_API_KEY} });
if (!response.ok) throw new Error(`Execution audit HTTP ${response.status}`);
const result = await response.json();
console.log(JSON.stringify(result.data.map(row=>({id:row.id,status:row.status,startedAt:row.startedAt,stoppedAt:row.stoppedAt})),null,2));
