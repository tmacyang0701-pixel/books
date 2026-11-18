"""Conservative, auditable study-level references from platform labels.

These rules are not a substitute for reading each solution. Broad labels and
unmapped concepts stay ungraded; higher contest difficulty is never squeezed
into GESP 8. Original contest provenance and inferred training groups differ.
"""
import re

LEVEL_TOPICS = {
    1: '输入输出|算术运算|逻辑运算|基础语法|顺序结构|分支结构|循环结构',
    2: '嵌套循环|多重循环|ASCII|字符编码|数学函数',
    3: '一维数组|字符串基础|枚举暴力|模拟|位运算|进制|vector',
    4: '二维数组|结构体|选择排序|冒泡排序|插入排序|计数排序|桶排序|递推|前缀和|差分',
    5: '函数与递归|递归|贪心|二分|分治|高精度|归并排序|快速排序|质数判断|质数筛法|最大公约数|最小公倍数|质因数分解|同余|链表|list|初等数论|尺取法|离散化',
    6: '广度优先搜索BFS|深度优先搜索DFS|棋盘搜索|剪枝|记忆化搜索|一维DP|背包DP|栈|队列|queue|deque|双端队列|二叉树|完全二叉树|哈夫曼树|二叉排序树|哈夫曼Huffman',
    7: '棋盘DP|区间DP|降低维度优化|邻接矩阵|邻接表|图的深度优先遍历|图的广度优先遍历|洪水填充|字符串hash|哈希表',
    8: '倍增|快速幂|单源最短路算法|Dijkstra算法|Bellman-Ford算法|SPFA算法|Floyd-Warshall算法|最小生成树|并查集|最近公共祖先LCA|排列组合|二项式定理|面积计算|矢量运算|位置关系|线段相交',
}
TOPIC_LEVEL = {topic:level for level,topics in LEVEL_TOPICS.items() for topic in topics.split('|')}
ADVANCED = set(('线段树|树状数组|状态压缩DP|树形DP|数位DP|插头DP|单调队列优化|斜率优化|凸完全单调性|四边形不等式|'
                '强连通分量|割点与割边|网络流|最大流|费用流|2-SAT|一般图的最大匹配|二分图匹配|差分约束|次小生成树|'
                '字符串匹配KMP算法|最长回文串Manacher算法|AC自动机|扩展KMP|DFA算法|NFA算法|后缀自动机|SAM字典树|'
                'Trie树|后缀数组|SA后缀树|有限状态自动机|回文自动机|分数规划|模拟退火|分块|块状链表|ST表|跳跃表|'
                '字典树Trie树|笛卡尔树|AVL|treap|splay|二叉平衡树|基环树|树链剖分|可持久化线段树|二维线段树|后缀树|'
                '树套树|K-D树|最小树形图|动态树LCT|二项堆|左偏树|欧拉定理|费马小定理|逆元|扩展欧几里得|中国剩余定理|'
                'Lucas定理|原根|BSGS算法|狄利克雷卷积|平方剩余|容斥原理|卡特兰数|斯特林数|生成函数|莫比乌斯变换|'
                'Burnside引理和Polya原理|概率与期望|矩阵的逆|行列式|高斯消元|异或方程组|线性基|快速傅里叶变换FFT|'
                '快速数论变换NTT|拉格朗日插值|Nim游戏|SG函数|凸多边形的交|平面凸包|半平面交|旋转卡壳|极限|导数|积分|定积分|'
                '立体解析|几何级数|微积分初步|高等数学').split('|'))
BROAD = set('数学|算法技巧|基础算法|排序算法|搜索算法|动态规划DP|图论算法|字符串算法|构造|数据结构|树形结构|线性结构|组合数学|概率统计|线性代数|计算几何|博弈论|STL|结构化程序设计'.split('|'))
LOW_DIFFICULTY = {'入门', '普及-', '普及/提高-'}
HIGH_DIFFICULTY = {'普及+/提高', '提高+/省选-', '省选/NOI-', 'NOI/NOI+/CTSC'}


def classify(row, title, original_source):
    topics = list(dict.fromkeys(row.get('labelList') or []))
    difficulty = row.get('difficultyStr', '')
    origin = str(row.get('origin', ''))
    explicit_j = origin in ('17','21') or re.search(r'CSP[ -]?J|NOIP.*普及', title, re.I)
    explicit_s = origin in ('18','22') or re.search(r'CSP[ -]?S|NOIP.*提高', title, re.I)
    advanced = sorted(set(topics)&ADVANCED)
    if explicit_j:
        group, group_basis = 'csp-j', '按原题源的入门／普及组归类；原题源：'+original_source
    elif explicit_s:
        group, group_basis = 'csp-s', '按原题源的提高组归类；原题源：'+original_source
    elif difficulty in HIGH_DIFFICULTY or advanced or origin in ('13','14','15','19','20'):
        group, group_basis = 'csp-s', '按平台难度或高阶知识点放入提高训练／拓展；不表示题目原属 CSP-S。'
    elif difficulty in LOW_DIFFICULTY:
        group, group_basis = 'csp-j', '按平台难度放入入门／普及训练；不表示题目原属 CSP-J。'
    else:
        group, group_basis = 'bank', '平台信息不足，竞赛训练分组待复核。'
    result = dict(group=group, groupBasis=group_basis, level=None,
                  levelStatus='待归级', cspDifficulty=difficulty or '平台未标难度')
    if origin in {str(i) for i in range(30,38)}:
        result.update(level=int(origin)-29, levelStatus='平台原题源等级', levelBasis='平台题源标为 '+original_source+'；保留该等级，未重新核定原题真实性。')
    elif advanced or difficulty in HIGH_DIFFICULTY:
        result.update(levelStatus='竞赛拓展', levelBasis='平台标签含 '+('、'.join(advanced) if advanced else difficulty)+'，暂不纳入 GESP 等级练习。')
    elif not topics:
        result['levelBasis'] = '平台未提供算法标签，已保留原题与难度，待阅读题面和解法后归级。'
    else:
        unmapped = [t for t in topics if t not in TOPIC_LEVEL and t not in BROAD]
        specific = [t for t in topics if t in TOPIC_LEVEL]
        broad = [t for t in topics if t in BROAD]
        # A broad major technique (e.g. DP) must not be ignored just because an
        # accompanying prerequisite (e.g. arrays) happens to have a level.
        if unmapped or broad or not specific:
            result['levelBasis'] = '平台标签 '+ '、'.join(unmapped+broad or topics)+' 尚不能确定具体解法层级，保留为待归级。'
        else:
            level = max(TOPIC_LEVEL[t] for t in specific)
            result.update(level=level, levelStatus='标签参考·未逐题复核',
                          levelBasis='依据平台算法标签 '+ '、'.join(specific)+f' 自动映射为 GESP {level} 级学习参考；尚未逐题核验解法与数据范围。')
    return result
