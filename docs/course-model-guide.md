# 通用 Course Model 与课程细化方式

## 通用层

所有 Course Mirror 共用以下对象：

```text
CourseProfile
SourceDocument
KnowledgeNode / KnowledgeEdge
Problem
SolutionPath / SolutionStep
HintNode
CommonMistake
HarnessSpec / HarnessResult
LearningEvidence
EvalCase
```

通用层解决“课程资产如何登记、检索、调用、验证和评测”，不试图规定所有学科怎样推理。

## 课程插件层

课程通过 `capabilities` 和 `harnesses` 细化：

- 数分：定理条件、量词、证明逻辑、提示泄露控制。
- 高代：矩阵和符号计算、秩/维数/基条件。
- 大物：模型假设、单位量纲、方向与数量级。
- 点拓：定义约定、量词、反例和条件偷换。
- 常微分：方程分类、存在唯一性、符号残差和数值交叉验证。

新增课程时不复制 Student Mirror。只需添加 Course Profile、课程知识、课程 Harness 和 Eval，并实现统一 Course Mirror 协议。

## CoursePack 进入系统的流水线

```text
授权来源登记
→ 文档解析/OCR
→ 人工校对
→ 章节与知识节点
→ 题目、解法、提示结构
→ Harness 规则
→ Eval
→ 审核发布 CoursePack Version
```

教材事实优先进入检索和结构化知识层；微调优先用于稳定行为，如渐进提示、证据抽取和输出格式。

