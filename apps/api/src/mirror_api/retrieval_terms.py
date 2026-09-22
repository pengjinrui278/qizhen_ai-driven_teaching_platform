"""Deterministic concept normalization, not a semantic embedding model."""
import re

CONCEPT_GROUPS = (
    ("一致连续", "uniform continuity"), ("一致收敛", "uniform convergence"),
    ("逐点收敛", "点态收敛", "pointwise convergence"),
    ("极限唯一性", "极限的唯一性"), ("数列极限", "sequence limit"),
    ("函数极限", "function limit"), ("柯西准则", "cauchy criterion", "柯西收敛准则"),
    ("确界", "supremum", "infimum"), ("闭区间套", "区间套定理"),
    ("紧致", "compactness"), ("连通", "connectedness"),
    ("中值定理", "mean value theorem"), ("泰勒", "taylor"),
    ("黎曼积分", "riemann integral"), ("反常积分", "广义积分", "improper integral"),
    ("幂级数", "power series"), ("绝对收敛", "absolute convergence"),
    ("条件收敛", "conditional convergence"), ("偏导数", "partial derivative"),
    ("全微分", "total differential"), ("隐函数", "implicit function"),
    ("特征值", "eigenvalue"), ("特征向量", "eigenvector"),
    ("线性无关", "linear independence"), ("向量空间", "vector space"),
    ("对角化", "diagonalization"), ("正定", "positive definite"),
    ("秩", "rank"), ("行列式", "determinant"),
    ("动量守恒", "conservation of momentum"), ("能量守恒", "conservation of energy"),
    ("高斯定律", "gauss law"), ("电磁感应", "electromagnetic induction"),
    ("存在唯一性", "存在与唯一性", "existence and uniqueness"),
    ("初值问题", "initial value problem"), ("分离变量", "separation of variables"),
)


def concept_groups(text: str) -> list[tuple[str, ...]]:
    lowered = text.casefold()
    return [group for group in CONCEPT_GROUPS if any(
        (alias in lowered if re.search(r"[一-龥]", alias)
         else re.search(r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])", lowered))
        for alias in group)]


def concept_query(text: str) -> str:
    """Keep meaningful concepts from the entire OCR text, not its first sentence."""
    groups = concept_groups(text[:12000])
    return " ".join(group[0] for group in groups[:8]) if groups else text[:500]
