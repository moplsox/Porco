// Credentials are accepted only on stdin, retained in memory, and passed to Git through its environment.
import {spawnSync} from 'node:child_process';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break}
const c=JSON.parse(input.trim());input='';
const env={...process.env};
if(c.auth_mode!=='work_proxy'){env.GIT_CONFIG_COUNT='1';env.GIT_CONFIG_KEY_0='http.extraHeader';env.GIT_CONFIG_VALUE_0='Authorization: Bearer '+c.token}
function git(args){const r=spawnSync('git',args,{env,encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)process.exit(r.status||1)}
git(['remote','add','origin',c.remote_url]);git(['add','.']);git(['commit','-m','Build complete Adriatic Letters visual novel']);git(['push','-u','origin',c.branch||'main']);git(['rev-parse','HEAD']);
