"""Explicit reviewed joins only; never deduplicate solely by question number."""
import hashlib,json
from pathlib import Path

def assemble(rows,spec,sha):
    members=spec['members']
    ids=[m['id'] for m in members]
    if len(ids)!=len(set(ids)):raise ValueError('Repeated fragment')
    fragments=[rows[sha+':'+i] for i in ids]
    digest=hashlib.sha256(json.dumps([r['original_text'] for r in fragments],ensure_ascii=False).encode()).hexdigest()
    if digest!=spec['content_sha256']:raise ValueError('Reviewed content changed')
    positions=[]
    for m,r in zip(members,fragments):
        if m['role'] not in ('question','solution'):raise ValueError('Unknown content role')
        if r['source_sha256']!=sha or r['part']!='body':raise ValueError('Wrong source or backmatter')
        if not r['chapter'] or not r['section']:raise ValueError('Unresolved location')
        if (r['chapter']['number'],r['section']['number'])!=(spec['chapter'],spec['section']):raise ValueError('Cross-section merge')
        positions.extend((s['pdf_page'],s['block_index']) for s in r['source_spans'])
    if positions!=sorted(set(positions)):raise ValueError('Unordered fragments')
    pages=sorted(set(p for p,_ in positions))
    if pages!=list(range(pages[0],pages[-1]+1)):raise ValueError('Missing intervening page')
    if not any(m['role']=='question' for m in members):raise ValueError('Missing question')
    first=fragments[0]
    return {'id':sha+':'+spec['kind']+':'+str(spec['chapter'])+'.'+str(spec['section'])+':'+spec['number'],
        'source_sha256':sha,'book_title':first['book_title'],'edition':first['edition'],'volume':first['volume'],
        'kind':spec['kind'],'original_number':spec['number'],'chapter':first['chapter'],'section':first['section'],
        'parts':[{'fragment_id':r['id'],'role':m['role'],'label':m.get('label'),
                  'original_text':r['original_text'],'source_spans':r['source_spans']} for m,r in zip(members,fragments)],
        'source_spans':[s for r in fragments for s in r['source_spans']],
        'review':{'status':'agent_visual_assembly_checked','reviewed_at':'2026-09-08','teacher_reviewed':False,
                  'content_sha256':digest,'scope':'原文片段、题号、题干与解答边界、跨页连接；未等同学科教师审定'},
        'eligible_for_answers':False,'eligible_for_exercise_bank':False,
        'notes':spec.get('notes',[])}

def main():
    count=0
    for manifest in Path('data/textbook-library').glob('*/assembly-reviewed.json'):
        spec=json.loads(manifest.read_text(encoding='utf-8'));folder=manifest.parent
        rows={r['id']:r for r in map(json.loads,(folder/'compiled/units.jsonl').read_text(encoding='utf-8').splitlines())}
        output=[assemble(rows,s,spec['source_sha256']) for s in spec['units']]
        consumed=[p['fragment_id'] for unit in output for p in unit['parts']]
        if len(consumed)!=len(set(consumed)):raise ValueError('Fragment assigned to multiple original questions')
        (folder/'compiled/assembled-units.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
        count+=len(output)
    print(json.dumps({'assembled_original_units':count,'published':0,'api_calls':0}))
if __name__=='__main__':main()
