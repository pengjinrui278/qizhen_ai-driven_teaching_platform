// Display copy only; /courses remains the authority for registered courses.
const intros:Record<string,string>={
 mathematical_analysis:"理解定义、定理与证明思路",
 linear_algebra_analytic_geometry:"理清结构、运算与推导",
 university_physics:"从现象出发，建立物理模型",
 point_set_topology:"探索空间、连续与连通的性质",
 ordinary_differential_equations:"建立微分方程，理解解的变化",
 python_programming:"读懂代码，拆解问题与调试",
 electronic_circuits:"分析电路，连接原理与计算",
 psychology_applications:"理解心理机制，联系生活情境",
 college_english:"练习阅读、表达与语言运用",
 ai:"理解AI知识，探索工具与应用",
};
export function courseIntro(id:string){return intros[id]||"从课程问题出发，逐步理解与实践";}
