"""有明确适用边界的五类学科工具。验证结构化计算，不冒充任意证明判定器。"""
from fractions import Fraction
from itertools import product

VERSION = "course-tools-1"


def q(x):
    s = str(x)
    if len(s) > 80:
        raise ValueError("数值过长")
    return Fraction(s)


def verify(tool, data):
    if tool == "analysis_epsilon":
        # 证书适用族：a_n=L+c/n，验证n>=N时|a_n-L|<epsilon。
        epsilon, c, n = q(data["epsilon"]), abs(q(data["c"])), int(data["N"])
        if epsilon <= 0 or n < 1:
            raise ValueError("epsilon和N必须为正")
        passed = c / n < epsilon
        detail = f"对 a_n=L+c/n，n≥{n} 时误差≤{c/n}，要求严格小于{epsilon}。"
    elif tool == "linear_residual":
        a, x, b = data["A"], data["x"], data["b"]
        if not (1 <= len(a) <= 12 and 1 <= len(x) <= 12 and len(b) == len(a)):
            raise ValueError("矩阵规模不匹配或超出12")
        if any(len(row) != len(x) for row in a):
            raise ValueError("矩阵列数与向量长度不同")
        residual = [sum(q(v)*q(w) for v,w in zip(row,x))-q(rhs) for row,rhs in zip(a,b)]
        passed = all(r == 0 for r in residual)
        detail = "Ax-b=" + str([str(r) for r in residual])
    elif tool == "physics_dimensions":
        # SI基本维数向量[L,M,T,I,Θ,N,J]；比较乘除后的指数。
        left, numerator, denominator = data["left"], data["numerator"], data.get("denominator", [])
        vectors = [left] + numerator + denominator
        if len(vectors) > 20 or any(len(v) != 7 for v in vectors):
            raise ValueError("量纲必须为7维向量，最多20项")
        right = [sum(q(v[i]) for v in numerator)-sum(q(v[i]) for v in denominator) for i in range(7)]
        passed = all(q(l) == r for l,r in zip(left,right))
        detail = "右侧量纲指数=" + str([str(r) for r in right]) + "；量纲一致不代表物理模型正确。"
    elif tool == "finite_topology":
        universe = frozenset(data["universe"])
        if not (1 <= len(universe) <= 8) or len(data["opens"]) > 256:
            raise ValueError("仅支持不超过8点的有限空间")
        opens = {frozenset(x) for x in data["opens"]}
        passed = (frozenset() in opens and universe in opens
                  and all(s <= universe for s in opens)
                  and all(a | b in opens and a & b in opens for a,b in product(opens, repeat=2)))
        detail = "有限集合上检查空集、全集、有限交并封闭；不适用于无限拓扑的完整证明。"
    elif tool == "ode_polynomial":
        # 验证多项式系数给定的y是否满足y'=a*y+b(t)和初值。
        coeff = [q(x) for x in data["coefficients"]]
        forcing = [q(x) for x in data.get("forcing", [])]
        if not coeff or max(len(coeff),len(forcing)) > 12:
            raise ValueError("多项式最多12个系数")
        a = q(data.get("a", 0))
        size = max(len(coeff),len(forcing))
        residual = [(coeff[i+1]*(i+1) if i+1 < len(coeff) else 0)
                    -a*(coeff[i] if i<len(coeff) else 0)
                    -(forcing[i] if i<len(forcing) else 0) for i in range(size)]
        t0,y0 = q(data.get("t0",0)), q(data["y0"])
        passed = all(x == 0 for x in residual) and sum(c*t0**i for i,c in enumerate(coeff)) == y0
        detail = "多项式回代残差=" + str([str(r) for r in residual]) + "；同时检查给定初值。"
    else:
        raise ValueError("未知验证工具")
    return {"tool": tool, "version": VERSION, "status": "passed" if passed else "failed", "detail": detail}


CASES = [
    ("analysis_epsilon", {"epsilon":"1/10","c":1,"N":11}, True),
    ("analysis_epsilon", {"epsilon":"1/10","c":1,"N":10}, False),
    ("linear_residual", {"A":[[1,2],[2,1]],"x":[1,2],"b":[5,4]}, True),
    ("linear_residual", {"A":[[1,2],[2,1]],"x":[1,2],"b":[5,5]}, False),
    ("physics_dimensions", {"left":[0,0,1,0,0,0,0],"numerator":[[1,0,0,0,0,0,0]],
                            "denominator":[[1,0,-1,0,0,0,0]]}, True),
    ("physics_dimensions", {"left":[0,0,1,0,0,0,0],"numerator":[[1,0,-1,0,0,0,0]],
                            "denominator":[[1,0,0,0,0,0,0]]}, False),
    ("finite_topology", {"universe":[1,2],"opens":[[],[1],[1,2]]}, True),
    ("finite_topology", {"universe":[1,2,3],"opens":[[],[1],[2],[1,2,3]]}, False),
    ("ode_polynomial", {"coefficients":[1,0,1],"forcing":[0,2],"y0":1}, True),
    ("ode_polynomial", {"coefficients":[1,0,1],"forcing":[0,2],"y0":0}, False),
]


def evaluate_tools():
    results = []
    for tool, data, expected in CASES:
        result = verify(tool, data)
        results.append({**result, "expected_valid": expected,
                        "test_passed": (result["status"] == "passed") == expected})
    return {"version": VERSION, "total":len(results),
            "passed":sum(x["test_passed"] for x in results), "cases":results,
            "scope":"工具边界回归集，不代表真实模型答题正确率或学生学习收益"}
