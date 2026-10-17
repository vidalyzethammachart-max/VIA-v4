import { timingSafeEqual } from 'node:crypto';

export function validationError(message) {
  const error = new Error(message);
  error.status = 422;
  error.code = 'invalid_video';
  return error;
}

export function validateVideoSource(source, env=process.env) {
  let url;
  try { url = new URL(source); } catch { throw validationError('Invalid video download URL.'); }
  if(url.username || url.password) throw validationError('Video URL credentials are not allowed.');
  if(env.VIDEO_ALLOW_LOCAL_TEST_URLS === 'true' && url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return url;
  const allowed = new Set((env.VIDEO_ALLOWED_HOSTS || '').split(',').map(s=>s.trim()).filter(Boolean));
  if(env.R2_ACCOUNT_ID) allowed.add(`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  if(url.protocol !== 'https:' || !allowed.has(url.hostname) || (url.port && url.port !== '443')) throw validationError('Video host is not an allowed HTTPS storage host.');
  return url;
}

export function parseMediaDuration(metadata, maximum=1200) {
  const match = metadata.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const seconds = match ? Number(match[1])*3600+Number(match[2])*60+Number(match[3]) : NaN;
  if(!Number.isFinite(seconds) || seconds<=0) throw validationError('Unable to determine a valid video duration.');
  if(seconds>maximum) throw validationError('Video must be 20 minutes or shorter.');
  return seconds;
}

export function analysisAccess(authorization,env=process.env) {
  const token=env.ANALYSIS_API_TOKEN?.trim();
  if(!token) return 503;
  const expected=Buffer.from(`Bearer ${token}`), actual=Buffer.from(authorization || '');
  return actual.length===expected.length && timingSafeEqual(actual,expected) ? 200 : 401;
}

export function requireAnalysisAccess(req,res,next) {
  const status=analysisAccess(req.headers.authorization);
  if(status!==200) return res.status(status).json({error:status===503?'Analysis access is not configured.':'Unauthorized analysis request.'});
  next();
}
