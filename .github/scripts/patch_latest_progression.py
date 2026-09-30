from pathlib import Path
p = Path('server/src/chain/idea-appeal-gate.service.ts')
s = p.read_text(encoding='utf-8')
old = "const PROGRESSION = /(起初|最初|第一|随后|接着|之后|第二|第三|却|反而|直到|进一步|升级|失控|恶化|暴露|发现|揭开|逼迫|迫使|最终|最后|真相|代价|反转|转而|同时)/g;"
new = "const PROGRESSION = /(起初|最初|第一|随后|接着|之后|第二|第三|先|再|开始|后来|此后|从此|继而|与此同时|却|反而|直到|进一步|升级|失控|恶化|暴露|发现|揭开|逼迫|迫使|最终|最后|真相|代价|反转|转而|同时)/g;"
if old not in s:
    raise SystemExit('progression anchor missing')
p.write_text(s.replace(old, new, 1), encoding='utf-8')
