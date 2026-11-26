import fs from 'node:fs';import {parseEnv} from 'node:util';
const e=parseEnv(fs.readFileSync('trial-beta/trial.env','utf8'));
console.log(`面板地址：http://127.0.0.1:${e.PORT}/\n本机登录令牌：${e.EVERLIGHT_UI_TOKEN}\n请勿将令牌或 trial-beta 目录分享给他人。`);
