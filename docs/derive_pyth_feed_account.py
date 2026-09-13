import hashlib
A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58d(s):
    n=0
    for c in s: n=n*58+A.index(c)
    b=n.to_bytes((n.bit_length()+7)//8,'big')
    pad=len(s)-len(s.lstrip('1'))
    return b'\0'*pad+b
def b58e(b):
    n=int.from_bytes(b,'big'); r=''
    while n: n,m=divmod(n,58); r=A[m]+r
    pad=len(b)-len(b.lstrip(b'\0'))
    return '1'*pad+r
q=2**255-19
d=-121665*pow(121666,q-2,q)%q
def oncurve(b):
    y=int.from_bytes(b,'little')&((1<<255)-1)
    sign=b[31]>>7
    if y>=q: return False
    y2=y*y%q
    u=(y2-1)%q; v=(d*y2+1)%q
    x=u*pow(v,(q+3)//8,q)*pow(u,(q-5)//8,q)%q if False else u*pow(v*v*v,q-2,q)%q
    # standard recovery
    uv3=u*pow(v,3,q)%q; uv7=u*pow(v,7,q)%q
    x=uv3*pow(uv7,(q-5)//8,q)%q
    if (v*x*x-u)%q==0: pass
    elif (v*x*x+u)%q==0: x=x*pow(2,(q-1)//4,q)%q
    else: return False
    if x==0 and sign: return False
    return True
def fpa(seeds, program):
    pid=b58d(program)
    for bump in range(255,-1,-1):
        h=hashlib.sha256()
        for s in seeds: h.update(s)
        h.update(bytes([bump])); h.update(pid); h.update(b'ProgramDerivedAddress')
        c=h.digest()
        if not oncurve(c): return b58e(c), bump
    raise Exception('none')
feeds={
 'TSLAX/USD':'47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362',
 'NVDAX/USD':'4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f',
 'SOL/USD':'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
}
push='pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT'
for name,fid in feeds.items():
    for shard in (0,1):
        addr,bump=fpa([shard.to_bytes(2,'little'), bytes.fromhex(fid)], push)
        print(name,'shard',shard,addr)
