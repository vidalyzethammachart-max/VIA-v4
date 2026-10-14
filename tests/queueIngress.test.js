import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('form routes all supported submissions to authenticated queue without inline AI',()=>{
 const source=readFileSync('src/page/FormSubmit.tsx','utf8');
 assert.match(source,/supabase.functions.invoke\("forward-to-n8n"/);
 assert.doesNotMatch(source,/await fetch\(getVideoAnalysisUrl\(\)/);
 assert.doesNotMatch(source,/await fetch\(WEBHOOK_URL/);
});
