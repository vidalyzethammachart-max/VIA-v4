import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../src/services/documentDownload.js', import.meta.url);

test('download links name both document formats after the Thai evaluation title', async () => {
  const {buildDocumentDownloadUrl} = await import(moduleUrl);
  const source='https://storage.example/object/sign/result.pdf?token=keep-me';
  for (const format of ['pdf','docx']) {
    const url=new URL(buildDocumentDownloadUrl(source,'การประเมินวิดีโอการสอน',format,'evaluation-248'));
    assert.equal(url.searchParams.get('download'),`การประเมินวิดีโอการสอน.${format}`);
    assert.equal(url.searchParams.get('token'),'keep-me');
    assert.equal(url.pathname,'/object/sign/result.pdf');
  }
  assert.equal(new URL(source).searchParams.has('download'),false);
});

test('download filenames strip filesystem-invalid characters and trailing dots', async () => {
  const {buildDocumentFilename} = await import(moduleUrl);
  assert.equal(buildDocumentFilename('  บทเรียน: A/B\\C?*<>|"\n.  ','pdf','evaluation-248'),'บทเรียน_ A_B_C_______.pdf');
  assert.equal(buildDocumentFilename('CON','docx','evaluation-248'),'_CON.docx');
  assert.equal(buildDocumentFilename('หัวข้อ.pdf','pdf','evaluation-248'),'หัวข้อ.pdf');
});

test('missing titles use the document identity instead of a generic result name', async () => {
  const {buildDocumentFilename} = await import(moduleUrl);
  for (const title of [null,undefined,'  ',{},'...']) {
    assert.equal(buildDocumentFilename(title,'docx','evaluation-248'),'evaluation-248.docx');
  }
  assert.equal(buildDocumentFilename(null,'pdf','summary-abc'),'summary-abc.pdf');
});

test('long Unicode filenames remain below filesystem byte limits', async () => {
  const {buildDocumentFilename} = await import(moduleUrl);
  const name=buildDocumentFilename('ก'.repeat(200),'docx','evaluation-248');
  assert.ok(Buffer.byteLength(name,'utf8')<=240);
  assert.match(name,/^ก+\.docx$/u);
});
