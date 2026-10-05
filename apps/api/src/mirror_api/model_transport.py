"""Bounded calls: retry connection failures once, never uncertain paid requests."""
import logging
import json

import httpx

logger = logging.getLogger(__name__)


def _safe_end_metadata(choice, value, payload):
    """Only bounded enums/counts; never provider text, prompts, IDs or credentials."""
    reason = choice.get("finish_reason")
    known = ("stop", "length", "content_filter", "tool_calls", "function_call")
    usage = value.get("usage")
    usage = usage if isinstance(usage, dict) else {}
    details = usage.get("completion_tokens_details")
    details = details if isinstance(details, dict) else {}

    def count(number):
        return number if type(number) is int and 0 <= number <= 1_000_000_000 else None

    effort = payload.get("reasoning_effort")
    return {
        "finish_reason": reason if isinstance(reason, str) and reason in known else
                         "missing" if reason is None else "unknown",
        "completion_tokens": count(usage.get("completion_tokens")),
        "reasoning_tokens": count(details.get("reasoning_tokens")),
        "token_limit": count(payload.get("max_tokens")),
        "reasoning_effort": effort if effort in ("low", "medium", "high") else "unspecified",
    }

class ModelError(Exception):
    def __init__(self,status_code:int,detail:str):
        super().__init__(detail)
        self.status_code=status_code
        self.detail=detail

def complete(base_url,api_key,payload,timeout):
    if not api_key:
        raise ModelError(503,"课程助手暂不可用，请稍后重试。")
    for attempt in range(2):
        try:
            response=httpx.post(base_url.rstrip("/")+"/chat/completions",
                headers={"Authorization":"Bearer "+api_key},json=payload,
                timeout=timeout,follow_redirects=False)
            break
        except (httpx.ConnectTimeout, httpx.ConnectError):
            if attempt == 0:
                continue
            raise ModelError(503,"暂时无法连接课程助手，请稍后重试。") from None
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
        if choice.get("finish_reason") != "stop":
            metadata = _safe_end_metadata(choice, value, payload)
            logger.warning("model_response_rejected %s", json.dumps(metadata, sort_keys=True), extra=metadata)
            if choice.get("finish_reason") == "length":
                raise ModelError(502,"本次生成达到模型输出上限，回答未完成。你的问题已保留，可点击重试；若仍失败，请联系平台管理员调整生成配置。")
            raise ModelError(502,"本次回答未完整生成，请缩小问题范围后重试。")
        if not isinstance(answer,str) or not answer.strip():
            raise ModelError(502,"本次未得到有效回答，请重试。")
        return answer
    except (ValueError,KeyError,IndexError,TypeError):
        raise ModelError(502,"本次未得到有效回答，请重试。") from None
