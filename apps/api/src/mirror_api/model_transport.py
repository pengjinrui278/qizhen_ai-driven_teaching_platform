"""Bounded, non-retrying model calls. Never include provider bodies or credentials in errors."""
import httpx

class ModelError(Exception):
    def __init__(self,status_code:int,detail:str):
        super().__init__(detail)
        self.status_code=status_code
        self.detail=detail

def complete(base_url,api_key,payload,timeout):
    if not api_key:
        raise ModelError(503,"课程助手暂不可用，请稍后重试。")
    try:
        response=httpx.post(base_url.rstrip("/")+"/chat/completions",
            headers={"Authorization":"Bearer "+api_key},json=payload,
            timeout=timeout,follow_redirects=False)
    except httpx.TimeoutException:
        raise ModelError(504,"回答超时，请稍后重试。") from None
    except httpx.RequestError:
        raise ModelError(503,"暂时无法连接课程助手，请稍后重试。") from None
    if response.status_code!=200:
        code=429 if response.status_code==429 else 503
        raise ModelError(code,"课程助手繁忙或暂不可用，请稍后重试。")
    try:
        value=response.json()
        choice=value["choices"][0]
        answer=choice["message"]["content"]
        if choice.get("finish_reason") not in (None,"stop"):
            raise ModelError(502,"本次回答未完整生成，请缩小问题范围后重试。")
        if not isinstance(answer,str) or not answer.strip():
            raise ModelError(502,"本次未得到有效回答，请重试。")
        return answer
    except (ValueError,KeyError,IndexError,TypeError):
        raise ModelError(502,"本次未得到有效回答，请重试。") from None
