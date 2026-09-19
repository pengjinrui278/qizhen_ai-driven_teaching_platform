"""Source-backed chapter atlas and the reviewed sequence concept subgraph."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def build():
    books=[]
    for path in sorted((ROOT/'data/textbook-library').glob('*/toc-reviewed.json')):
        t=json.loads(path.read_text(encoding='utf-8'))
        books.append({k:t[k] for k in ('source_sha256','book_title','edition','volume','chapters')})
    books.sort(key=lambda b:b['chapters'][0]['number'])
    raw=[json.loads(line) for line in (ROOT/'data/curated/analysis-sequences-v1/knowledge.jsonl').read_text(encoding='utf-8').splitlines()]
    nodes=[];edges=[]
    for k in raw:
        assert k['review']['status']=='agent_visual_checked' and k['source']['allowed_for_rag']
        nodes.append({'id':k['id'],'title':k['title'],'conditions':k['conditions'],
                      'source':{f:k['source'][f] for f in ('sha256','printed_page','pdf_page','locator')},
                      'review':'agent_visual_checked','teacher_reviewed':False})
        edges.extend({'from':p,'to':k['id'],'kind':'learning_prerequisite','evidence':k['id']} for p in k['prerequisites'])
    ids={n['id'] for n in nodes}
    assert all(e['from'] in ids and e['to'] in ids for e in edges)
    data={'course_id':'mathematical_analysis','books':books,'nodes':nodes,'edges':edges,
          'scope':'目录16章70节；知识联系仅覆盖已核对的7个数列知识节点，不是全书定理依赖图。'}
    out=ROOT/'artifacts/knowledge-map';out.mkdir(exist_ok=True)
    (out/'mathematical-analysis.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    template=(ROOT/'scripts/analysis-map-template.html').read_text(encoding='utf-8')
    (out/'mathematical-analysis.html').write_text(template.replace('__DATA__',json.dumps(data,ensure_ascii=False).replace('<','\\u003c')),encoding='utf-8')
    print(json.dumps({'chapters':sum(len(b['chapters']) for b in books),'sections':sum(len(c['sections']) for b in books for c in b['chapters']),'knowledge_nodes':len(nodes),'knowledge_edges':len(edges),'api_calls':0}))
if __name__=='__main__':build()
