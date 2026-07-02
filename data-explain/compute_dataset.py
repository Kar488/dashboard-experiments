import openpyxl, collections, json, re, datetime

p = r'C:\Users\karth\Dropbox\Documents\synched folder\my.projects\us.albertsons.bigbets\big bets\line 8\ds\Jewel_Store0058_16May (Jewel Merchants AI Pilot Review) v2.xlsx'
wb = openpyxl.load_workbook(p, data_only=True, read_only=True)
ws = wb['All Weeks - Wk(21,22,23)']
rows = list(ws.iter_rows(min_row=2, values_only=True))
def f(x):
    try: return float(x)
    except: return 0.0
DEPT=0; MEMP=10
oU,oR,oA,oT,oV=12,13,14,15,17
pU,pR,pA,pT,pV=21,22,23,26,28
lU,lR,lA,lT=31,32,33,37   # ly_units=AG=32? recheck
# recheck indices: A=0 dept ... AG ly_units. AG = 0-index 32. AH=33 sales, AI=34 agp. AL=37 ly_store_tactic
lU,lR,lA,lT=32,33,34,37
WK=45; WSTART=46
SHORT={'Alcohol Beverage':'Alcohol','Bakery Pkgd Outside':'Bakery pkg','Coffee Kiosk':'Coffee','Dairy':'Dairy',
'Deli/Prepared Foods':'Deli','Floral and Gift Candy':'Floral','Frozen Grocery':'Frozen','General Merchandise/HBC':'GM/HBC',
'Grocery Food':'Grocery','Grocery Non-Foods':'Groc nonfood','In-Store Bakery':'Bakery instore','Meat':'Meat',
'Produce':'Produce','Seafood':'Seafood'}
PR=lambda t: t not in (None,'','NOT_PROMOTED','-')
def bk(pt,ot):
    pp,op=PR(pt),PR(ot)
    if pp and not op: return 'off'
    if not pp and op: return 'new'
    if pp and op: return 'kept'
    return 'stay'
def depth(val,base):
    if not isinstance(val,str): return None
    try: base=float(base)
    except: return None
    if base<=0: return None
    s=val.strip().lower()
    m=re.search(r'(\d+(?:\.\d+)?)\s*%',s)
    if m: return float(m.group(1))/100
    m=re.search(r'\$(\d+(?:\.\d+)?)',s)
    if m: return float(m.group(1))/base
    m=re.search(r'(\d+(?:\.\d+)?)\s*c',s)
    if m: return (float(m.group(1))/100)/base
    return None

pV_ly=39  # ly_store_discount_value
DEDGES=[0,.05,.10,.15,.20,.30,.50,1.01]; DLAB=["0-5%","5-10%","10-15%","15-20%","20-30%","30-50%","50%+"]
HEDGES=[0,.25,.5,1,2,5,1e9]; HLAB=["<25c","25-50c","50c-$1","$1-2","$2-5","$5+"]
TACS=["ITEM DISCOUNT","BUY X GET X","MUST BUY","BUY X GET Y"]; TLAB=["Item discount","Buy X Get X","Must buy","Buy X Get Y"]
import statistics as st
def binidx(edges,v):
    for i in range(len(edges)-1):
        if v<edges[i+1]: return i
    return len(edges)-2

byweek=collections.defaultdict(list)
for r in rows: byweek[r[WK]].append(r)

allcuts=[]
weeks=[]
for wk in sorted(byweek):
    rs=byweek[wk]
    tot={'opt':[0.0,0,0],'plan':[0.0,0,0],'ly':[0.0,0,0]}
    tot={'opt':[0.0,0.0,0.0],'plan':[0.0,0.0,0.0],'ly':[0.0,0.0,0.0]}
    depts=collections.defaultdict(lambda:[0.0]*9)
    dbuck=collections.defaultdict(lambda:{k:[0.0,0.0,0.0,0] for k in ['off','new','kept','stay']})
    buckets={k:[0.0,0.0,0.0,0] for k in ['off','new','kept','stay']}
    dbin=[[0.0,0.0,0] for _ in DLAB]
    hbin=[0 for _ in HLAB]
    tac={s:[0]*len(TACS) for s in ['opt','plan','ly']}
    dmed={'opt':[],'plan':[],'ly':[]}
    promo={'opt':0,'plan':0,'ly':0}
    ws_date=None
    for r in rs:
        if ws_date is None and r[WSTART] is not None: ws_date=r[WSTART]
        dep=SHORT.get(r[DEPT],str(r[DEPT]))
        d=depts[dep]
        vals=[f(r[oU]),f(r[oR]),f(r[oA]),f(r[pU]),f(r[pR]),f(r[pA]),f(r[lU]),f(r[lR]),f(r[lA])]
        for i,v in enumerate(vals): d[i]+=v
        tot['opt'][0]+=vals[0];tot['opt'][1]+=vals[1];tot['opt'][2]+=vals[2]
        tot['plan'][0]+=vals[3];tot['plan'][1]+=vals[4];tot['plan'][2]+=vals[5]
        tot['ly'][0]+=vals[6];tot['ly'][1]+=vals[7];tot['ly'][2]+=vals[8]
        if PR(r[oT]): promo['opt']+=1
        if PR(r[pT]): promo['plan']+=1
        if PR(r[lT]): promo['ly']+=1
        bb=bk(r[pT],r[oT])
        b=buckets[bb]; b[0]+=vals[0]-vals[3]; b[1]+=vals[1]-vals[4]; b[2]+=vals[2]-vals[5]; b[3]+=1
        db=dbuck[dep][bb]; db[0]+=vals[0]-vals[3]; db[1]+=vals[1]-vals[4]; db[2]+=vals[2]-vals[5]; db[3]+=1
        for s,ti in (('opt',r[oT]),('plan',r[pT]),('ly',r[lT])):
            if ti in TACS: tac[s][TACS.index(ti)]+=1
        for s,vt in (('opt',(r[oT],r[oV])),('plan',(r[pT],r[pV])),('ly',(r[lT],r[pV_ly]))):
            pass
        for s,tcol,vcol in (('opt',r[oT],r[oV]),('plan',r[pT],r[pV]),('ly',r[lT],r[pV_ly])):
            if PR(tcol):
                dd=depth(vcol,r[MEMP])
                if dd is not None and 0<dd<1: dmed[s].append(dd)
        if PR(r[oT]):
            dd=depth(r[oV],r[MEMP])
            if dd is not None and 0<dd<1:
                bi=binidx(DEDGES,dd); dbin[bi][0]+=vals[2]; dbin[bi][1]+=vals[0]; dbin[bi][2]+=1
        if PR(r[pT]) and not PR(r[oT]) and vals[3]>0:
            be=(vals[2]-vals[5])/vals[3]
            if be>0:
                bi=binidx(HEDGES,be); hbin[bi]+=1
                allcuts.append({'wk':int(wk),'dep':dep,'n':str(r[7])[:38],'u':round(vals[3]),
                  'pa':round(vals[5]),'oa':round(vals[2]),'be':round(be*100)/100,'b':bi,
                  'ps':str(r[pV]) if r[pV] not in (None,'-') else ''})
    dep_out={k:{'opt':[round(v[0]),round(v[1]),round(v[2])],'plan':[round(v[3]),round(v[4]),round(v[5])],'ly':[round(v[6]),round(v[7]),round(v[8])],
      'b':{bn:[round(x[0]),round(x[1]),round(x[2]),x[3]] for bn,x in dbuck[k].items()}} for k,v in depts.items()}
    wsd = ws_date.strftime('%Y-%m-%d') if isinstance(ws_date,(datetime.date,datetime.datetime)) else str(ws_date)
    weeks.append({'wk':int(wk),'start':wsd,
      'tot':{k:[round(v[0]),round(v[1]),round(v[2])] for k,v in tot.items()},
      'promo':promo,
      'tac':tac,
      'dmed':{s:(round(st.median(v)*1000)/10 if v else 0) for s,v in dmed.items()},
      'depts':dep_out,
      'buckets':{k:[round(v[0]),round(v[1]),round(v[2]),v[3]] for k,v in buckets.items()},
      'dbin':[[round(x[0]),round(x[1]),x[2]] for x in dbin],
      'hbin':hbin})

allcuts.sort(key=lambda x:-x['u'])
perbin=collections.defaultdict(int); cuts=[]
for c in allcuts:
    if perbin[c['b']]<20: perbin[c['b']]+=1; cuts.append(c)
out={'meta':{'store':'0058','objective':'REVENUE','dlab':DLAB,'hlab':HLAB,'tlab':TLAB,
      'depts':list(SHORT.values())},'weeks':weeks,'cuts':cuts}
json.dump(out,open('dataset.json','w'),separators=(',',':'))
print('weeks:',[w['wk'] for w in weeks])
for w in weeks:
    print('wk',w['wk'],w['start'],'opt AGP',w['tot']['opt'][2],'plan AGP',w['tot']['plan'][2],'promo opt/plan',w['promo']['opt'],w['promo']['plan'])
print('depth bins (wk21 avg AGP/item):',[round(b[0]/b[2]) if b[2] else 0 for b in weeks[0]['dbin']], DLAB)
print('halo BE bins wk21:',weeks[0]['hbin'],HLAB)
print('json bytes:',len(open('dataset.json').read()))
