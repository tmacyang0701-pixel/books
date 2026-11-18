"""Build and verify the seven authorized lesson-10 supplemental exercises.

No login data is needed. Statements are paraphrased; original samples are kept.
Extra cases are independently authored, not platform hidden judge data.
"""
import argparse
import bisect
import collections
import itertools
import random
from pathlib import Path

from build_xiaohou_practice import ROOT, write_bank, verify

PREFIX = 'xiaohou-2026-11-21-5-'
ARCHIVE = ROOT/'data/gesp/extra-tests/xiaohou-2026-11-21.zip'


def fruit(text):
    a = list(map(int,text.split())); n,current = a[:2]; saved = 0
    assert len(a)==2+2*n and 1<=n<=1000 and 1<=current<=10000
    for p,q in zip(a[2::2],a[3::2]):
        assert 1<=p<=100 and 1<=q<=100
        saved += current%p
        current = current//p*q
        assert current<=2_000_000_000 and current+saved<=2_000_000_000
    return str(saved+current)


def fire(text):
    a=text.split();s=a[0];n,k=map(int,a[1:3]);targets=a[3:]
    assert len(targets)==n and all(len(w)==k for w in targets)
    assert 1<=n<=10000 and 1<=k<=100 and k<=len(s)<=100000
    freq=collections.Counter(s[i:i+k] for i in range(len(s)-k+1))
    return '\n'.join(str(freq[w]) for w in targets)


def bomb(text):
    a=list(map(int,text.split()));n,m=a[:2];cards=collections.deque(a[2:2+m])
    # Platform sample 3 contains one extra trailing 0 after its declared m=20.
    assert len(cards)==m and cards.count(2)==n-1 and 1<=n<=30000 and m<=300000
    players=collections.deque(range(n));defuses=[0]*n
    while len(players)>1:
        player=players.popleft();card=cards.popleft()
        if card==2 and not defuses[player]:continue
        if card==2:defuses[player]-=1;cards.appendleft(2)
        if card==1:defuses[player]+=1
        players.append(player)
    return str(players[0]+1)


def barriers(text):
    a=list(map(int,text.split()));n,m=a[:2];end=2+n*m;q=a[end];queries=a[end+1:]
    assert len(queries)==q and 1<=n<=100 and 1<=m<=5000 and q<=300000
    weakest=[10**18]*m
    for row in range(n):
        total=0
        for j,damage in enumerate(sorted(a[2+row*m:2+(row+1)*m],reverse=True)):
            assert 1<=damage<=1000
            total+=damage;weakest[j]=min(weakest[j],total)
    answers=[]
    for power in queries:
        assert 1<=power<=10**9
        pos=bisect.bisect_left(weakest,power)
        answers.append(str(pos+1 if pos<m else -1))
    return '\n'.join(answers)


def newspapers(text):
    a=list(map(int,text.split()));n,m=a[:2]
    assert len(a)==2+2*n and 1<=m<=n<=100000
    profits=[]
    for buy,sell in zip(a[2::2],a[3::2]):
        assert 1<=buy<=sell<=1000
        profits.append(sell-buy)
    return str(sum(sorted(profits,reverse=True)[:m]))


def messages(text):
    a=list(map(int,text.split()));n,k,window=a[:3];times=a[3:]
    assert len(times)==n and 1<=n<=200000 and 0<=k<=10**9 and 1<=window<=10**9
    assert times==sorted(times) and 1<=times[0]<=times[-1]<=10**9
    accepted=collections.deque();answer=[]
    for t in times:
        while accepted and accepted[0]<=t-window:accepted.popleft()
        if len(accepted)<k:accepted.append(t);answer.append('Yes')
        else:answer.append('No')
    return '\n'.join(answer)


def rich(text):
    a=list(map(int,text.split()));n=a[0];buildings=a[1:n+1];m=a[n+1];targets=a[n+2:]
    assert len(targets)==m and 1<=n<=100 and 1<=m<=100000
    assert all(0<=x<=100 for x in buildings) and any(buildings)
    total=sum(x*x for x in buildings);pos=0;answer=[]
    for goal in targets:
        assert 1<=goal<=10**18
        # Retain a full final lap when the goal is an exact multiple of total.
        remaining=(goal-1)%total+1
        while remaining>0:
            pos=(pos+1)%n;remaining-=buildings[pos]**2
        answer.append(str(pos+1));total+=2*buildings[pos]+1;buildings[pos]+=1
    return '\n'.join(answer)


SOLVERS=[fruit,fire,bomb,barriers,newspapers,messages,rich]


def fmt_pairs(start,pairs):return f'{len(pairs)} {start}\n'+''.join(f'{a} {b}\n' for a,b in pairs)
def fmt_fire(s,targets):return f'{s}\n{len(targets)} {len(targets[0])}\n'+'\n'.join(targets)+'\n'
def fmt_bomb(n,cards):return f'{n}\n{len(cards)}\n'+' '.join(map(str,cards))+'\n'
def fmt_barriers(rows,queries):return f'{len(rows)} {len(rows[0])}\n'+''.join(' '.join(map(str,r))+'\n' for r in rows)+f'{len(queries)}\n'+'\n'.join(map(str,queries))+'\n'
def fmt_messages(k,t,times):return f'{len(times)} {k} {t}\n'+'\n'.join(map(str,times))+'\n'
def fmt_rich(cities,targets):return f'{len(cities)}\n'+' '.join(map(str,cities))+f'\n{len(targets)}\n'+'\n'.join(map(str,targets))+'\n'


def definitions():
    return [
        dict(title='水果集市',tags=['模拟','整数除法','取余'],platformProjectId=126732,
             description='有 N 个按顺序排列的水果摊。开始时你有 S 个香蕉。第一个摊用香蕉交换，后续每个摊只能使用上一个摊刚换到的水果：每 P 个旧水果换 Q 个新水果，每次都尽可能多地交换。不能凑够一组的旧水果留下带回家，不再参与后面的交换。求所有摊位交换结束后，留下的各类水果与最后换得的水果总数。',
             input='第一行 N、S。随后 N 行，每行 P、Q，描述该摊位的整组交换比例。',output='输出最终带回家的水果总数。',
             constraints='1 ≤ N ≤ 1000，1 ≤ S ≤ 10000，1 ≤ P,Q ≤ 100。保证运算过程中所有数字不超过 2×10^9。30% 的原平台数据 N=1；50% 的数据 P=1、N≤10、S≤100。',
             samples=[dict(input='5 10\n3 5\n2 1\n3 4\n6 3\n1 1',output='8',explanation='依次留下 1、1、1、2、0 个旧水果，最后换得 3 个水果，总数为 8。'),dict(input='8 200\n9 6\n32 18\n5 8\n4 9\n7 6\n10 12\n9 3\n50 30',output='78')]),
        dict(title='火眼金睛',tags=['字符串','计数','映射'],platformProjectId=126329,
             description='给定字符串 s 和 n 个长度都为 k 的目标字符串，按输入顺序统计每个目标在 s 中出现的次数。出现位置可以重叠，只要起始位置不同就分别计数。重复输入的目标也要分别输出。按字符原样匹配。',
             input='第一行字符串 s；第二行 n、k；接下来 n 行，每行一个长度为 k 的目标字符串。',output='输出 n 行，第 i 行为第 i 个目标字符串的出现次数。',
             constraints='1 ≤ n ≤ 10000，1 ≤ k ≤ 100，k ≤ |s| ≤ 100000。',
             samples=[dict(input='happynewyearhappynewyearhappy\n3 3\nhap\nnew\nyea',output='3\n2\n2'),dict(input='cbcbcbcbcbc\n2 3\ncbc\nbcb',output='5\n4',explanation='重叠匹配也计数。例如相邻的 bcb 可以共用中间的 b。')]),
        dict(title='炸弹猴',tags=['队列','模拟','循环'],platformProjectId=126839,
             description='n 名玩家按编号 1～n 的顺序轮流抽取牌堆顶部的一张牌，淘汰者跳过。0 是白板牌，无事发生；1 是拆弹牌，玩家将它保留；2 是炸弹牌。抽到炸弹时，若没有拆弹牌，该玩家淘汰且炸弹消失；否则消耗一张拆弹牌，将炸弹放回堆顶，轮到下一名仍在场的玩家抽牌。初始牌堆恰有 n−1 张炸弹牌。求最后剩余玩家的编号。',
             input='第一行玩家数 n；第二行牌数 m；第三行 m 个整数，按从堆顶到堆底的顺序给出牌面 0、1、2。',output='输出最后获胜玩家的编号。',
             constraints='1 ≤ n ≤ 30000，1 ≤ m ≤ 300000；炸弹牌恰有 n−1 张。原平台 50% 的数据 n≤100、m≤1000 且无拆弹牌；80% 的数据 n≤100、m≤1000。',
             samples=[dict(input='8\n11\n0 2 0 2 0 2 0 2 2 2 2',output='7'),dict(input='4 \n8\n0 1 1 2 0 2 0 2 ',output='2',explanation='玩家 2、3 依次用拆弹牌把炸弹放回堆顶；最终玩家 2 留在场上。'),dict(input='5\n20\n0 2 1 1 1 0 2 0 2 0 2 1 0 1 1 0 0 0 0 1 0',output='5',explanation='原平台样例存在牌数笔误：m 写为 20，实际列了 21 个牌面，最后多一个 0。本处保留原样例；读取前 20 张或将 m 改为 21，胜者均为 5，多出的末尾白板不影响胜负。')]),
        dict(title='清虚幻境大危机！',tags=['排序','贪心','前缀和','二分查找'],platformProjectId=125445,
             description='有 n 处裂缝，每处设 m 层防线，每层的部队造成一个正整数伤害。同一处裂缝的部队可以任意重排，但不能跨裂缝调动。每次风暴在每处裂缝各产生一个护甲为 power 的魔君。魔君依次受到沿途各层伤害，累计伤害达到或超过护甲时在当前层被击杀。采用最佳排列，求所有裂缝中最迟击杀魔君的层号（从 1 开始，包含击杀所在层）。如果任一裂缝全部 m 层的伤害仍不足，输出 -1。各次风暴分别计算，部队伤害不变。',
             input='第一行 n、m。接下来 n 行，每行 m 个部队伤害值。随后一行 q；接下来 q 行，每行一个护甲值 power。',output='对每次风暴输出一行：最佳部署下最迟击杀的层号，或 -1。',
             constraints='1 ≤ n ≤ 100，1 ≤ m ≤ 5000，1 ≤ q ≤ 300000；伤害值为 1～1000，1 ≤ power ≤ 10^9。原平台 20%：n,m,q≤10；50%：n,m≤100、q≤10；70%：n≤100、m≤500、q≤100；前三组每行伤害升序排列。90%：n≤100、m≤1000、q≤10000。',
             samples=[dict(input='3 4\n1 2 3 4\n2 3 4 5\n3 4 5 6 \n3\n3\n10\n15',output='1\n4\n-1'),dict(input='3 5\n3 7 2 5 6\n3 8 3 2 4\n7 6 5 1 9\n3\n19\n12 \n21',output='5\n2\n-1',explanation='各裂缝把伤害较大的部队放在前面。护甲 19 时最慢需要第 5 层；护甲 12 时最多第 2 层；护甲 21 时第二处裂缝总伤害只有 20，无法抵挡。')]),
        dict(title='卖报纸',tags=['贪心','排序'],platformProjectId=129082,
             description='有 n 张报纸，第 i 张的进价为 a_i，售价为 b_i。m 个顾客各买一张报纸，卖家可以决定向他们出售哪些报纸。每售出一张的利润为售价减进价，求卖出 m 张报纸能够获得的最大总利润。',
             input='第一行 n、m；接下来 n 行，每行 a_i、b_i。',output='输出最大总利润。',constraints='1 ≤ m ≤ n ≤ 100000；1 ≤ a_i ≤ b_i ≤ 1000。',
             samples=[dict(input='4 2\n2 10\n4 6\n2 5\n8 12\n',output='12\n',explanation='各张利润为 8、2、3、4，选择利润最大的两张，得到 12。')]),
        dict(title='发送消息',tags=['队列','双指针','滑动窗口'],platformProjectId=144575,
             description='消息按发送顺序到达，时间戳 t_i 非递减，同一时刻按编号从小到大处理。处理当前消息前，只统计已经接收且发送时间满足 t_i−T < t_p ≤ t_i 的消息。若这些消息少于 k 条，接收当前消息并加入队列，输出 Yes；否则拒收，输出 No。拒收的消息不进入队列，也不影响后续计数。初始队列为空。',
             input='第一行 n、k、T；接下来 n 行，每行一个发送时间 t_i。',output='输出 n 行，依次为每条消息的 Yes 或 No，注意大小写。',
             constraints='1 ≤ n ≤ 200000，0 ≤ k ≤ 10^9，1 ≤ T ≤ 10^9，1 ≤ t_1 ≤ … ≤ t_n ≤ 10^9。特别注意 k 可以为 0；距离当前时刻恰好 T 的旧消息已经过期。',
             samples=[dict(input='8 2 1000\n300\n600\n900\n1250\n1350\n1550\n1650\n1650\n\n',output='Yes\nYes\nNo\nNo\nYes\nNo\nYes\nNo')]),
        dict(title='小富翁',tags=['模拟','取余','循环','整数溢出'],platformProjectId=125739,
             description='n 座城市按编号顺时针围成一圈，第 i 座有 a_i 栋楼，经过时获得 a_i² 点成就感。最初位于 1 号城市。每次游览从当前城市的下一座开始，顺时针前进，允许绕圈重复经过城市；本次累计成就感从 0 开始，达到或超过目标 P 时停止，在停止城市新建一栋楼，并从这里开始下一次游览。输出每次停止的城市编号。每次游览开始时不计当前出发城市，但绕一圈再次经过它时需要计入。',
             input='第一行 n；第二行 n 个初始楼数；第三行游览次数 M；接下来 M 行，每行一个本次目标 P。',output='输出 M 行，每行是本次游览结束并新建楼的城市编号。',
             constraints='1 ≤ n ≤ 100，1 ≤ M ≤ 100000，0 ≤ a_i ≤ 100，1 ≤ P ≤ 10^18；初始 a_i 不全为 0。原平台 30%：n,M≤10、a_i≤10、P≤100；50%：n≤50、M≤10000、a_i≤50、P≤10^5；80%：P≤10^8。累计平方和及目标需要 64 位整数。',
             samples=[dict(input='5\n2 1 1 3 3\n3\n7\n14\n35',output='4\n2\n3',explanation='三次依次停在城市 4、2、3，每次建楼都会改变后续游览的成就感。'),dict(input='7\n9 0 13 8 0 0 15\n7\n160\n727\n6900\n3200\n2388\n3651\n90000',output='3\n7\n4\n7\n7\n3\n1')]),
    ]


def make_cases(defs):
    rng=random.Random(20261121)
    data=[[(s['input'],f'原题样例 {j+1}') for j,s in enumerate(p['samples'])] for p in defs]
    def add(i,text,label):
        if text not in {x for x,_ in data[i]}:data[i].append((text,label))
    for start,pairs,label in [
        (1,[(1,1)],'最小输入'),(1,[(2,100)],'不足一次交换，后续只能保留旧水果'),
        (10,[(3,5)],'单摊含余数'),(10,[(2,3)],'恰好整除'),(10000,[(1,100),(1,100),(1,20)],'结果达到 2×10^9'),
        (1,[(100,1),(1,100)],'当前水果变为零后不应复用剩余水果'),
        (99,[(100,100)]*1000,'N=1000，所有水果保留'),
        (10000,[(100,100)]*1000,'N=1000，数量不变'),
        (9999,[(100,99)]*1000,'N=1000，多轮余数与逐渐耗尽'),
        (10,[(3,1),(2,1),(2,1)],'每次剩余水果独立累加'),
    ]:add(0,fmt_pairs(start,pairs),label)
    for s,targets,label in [
        ('a',['a'],'最短匹配'),('a',['b'],'不存在'),('aaaaa',['aa','aa','ab'],'重叠与重复目标'),
        ('abcabc',['abcabc','bcabca'],'k 等于全文长度'),('ababa',['aba','bab'],'首尾重叠'),
        ('AaAa',['Aa','aa','aA'],'大小写按字符匹配'),('a'*100,['a'*100,'a'*99+'b'],'k=100'),
        ('a'*9000,['a','b'],'长串大量匹配'),('abc',['a']*1000,'重复查询保持顺序'),
        ('abcxyz',['xyz','abc','def'],'末尾、开头、未出现'),
    ]:add(1,fmt_fire(s,targets),label)
    for n,cards,label in [
        (1,[0],'单玩家立即获胜'),(2,[2],'首位玩家淘汰'),(2,[1,2],'下一玩家没有拆弹牌'),
        (2,[1,1,2],'两人连续拆同一枚炸弹'),(3,[1,1,1,2,2],'炸弹多次放回堆顶'),
        (3,[1,0,0,1,0,0,2,2],'同一玩家积累多张拆弹牌'),
        (4,[2,2,2],'连续淘汰跳过离场玩家'),(4,[0,2,0,2,0,2],'白板与炸弹交替'),
        (100,[0]*2000+[2]*99,'长时间轮转后连续淘汰'),
        (100,[1]*1000+[2]*99,'大量拆弹后仍需最终淘汰'),
    ]:add(2,fmt_bomb(n,cards),label)
    for rows,qs,label in [
        ([[1]],[1,2,10**9],'单层成功、失败'),([[1,2,3]],[1,3,4,5,6,7],'排序与等号边界'),
        ([[1000,1,1],[400,400,400]],[400,401,800,801,1002,1003],'最弱裂缝随层数变化'),
        ([[5,5],[5,5]],[5,6,10,11],'相等伤害及总伤害边界'),
        ([[1]*1000],[1,999,1000,1001],'千层累计'),
        ([[1000]*1000],[1,1000,1001,10**6,10**6+1],'最大单层伤害'),
        ([[9,1,5],[2,7,4]],[10,1,10,14,13,9],'查询无需排序且可以重复'),
        ([[1000]*10 for _ in range(100)],[1,10000,10001],'n=100'),
    ]:add(3,fmt_barriers(rows,qs),label)
    for m,pairs,label in [
        (1,[(1,1)],'最小输入，零利润'),(1,[(1,1000)],'最大单张利润'),
        (2,[(1,10),(990,1000),(5,20)],'不能按售价排序'),
        (3,[(1,2),(2,4),(3,6)],'m=n，全部卖出'),
        (2,[(1,5),(2,6),(3,7)],'相同利润'),(1,[(1,1)]*100,'全部零利润'),
        (1,[(1,2),(1,1000),(1,3)],'m=1'),
        (2000,[(1,1000)]*2000,'长输入及大利润和'),
        (1000,[(999,1000)]*2000,'近上限价格，小利润'),
    ]:add(4,fmt_pairs(m,pairs),label)
    for k,t,times,label in [
        (0,1,[1],'k=0 全拒收'),(1,1,[1],'最短接收'),(1,5,[1,5,6,6,11],'窗口左端点不包含'),
        (2,10,[1]*10,'同一时刻优先较小编号'),(1,10,[1,2,3,11,12,21],'拒收消息不进入队列'),
        (10**9,10**9,[1,1,10**9],'大 k 全接收'),(1,1,[1,2,3,4],'相邻时刻恰好过期'),
        (2,100,[1,2,101,102,102],'多条过期与同时刻到达'),
        (1,10**9,[1,10**9],'大时间边界'),(2,1,[10**9]*5,'时间上限的相同时间戳'),
        (0,1,list(range(1,1001)),'大量拒收'),(1,1,list(range(1,1001)),'大量接收'),
    ]:add(5,fmt_messages(k,t,times),label)
    for cities,targets,label in [
        ([1],[1],'单城市绕回自身'),([100],[10**18]*20,'单城市及最大目标'),
        ([1,1],[2,4,8],'目标恰好整圈，不能余数为零时立即停'),
        ([0,0,1],[1,1,1],'零伤害城市必须跳过'),([5,0,0],[25,26,10**18],'出发点不计，绕回时计入'),
        ([1,2,3],[1,4,5,9,14,15],'恰好达到目标'),
        ([100]*100,[10**18,1,10**18-1],'最大 n、楼数及大目标'),
        ([1,1,1],[1]*1000,'每次建楼，起点持续移动'),
        ([1],[1]*1200,'平方随建楼增长'),
        ([0]*99+[1],[10**18,1,10**18],'只有一座非零城市'),
    ]:add(6,fmt_rich(cities,targets),label)
    # Fill to 20 distinct, reproducible small mixed cases per problem.
    for i in range(7):
        while len(data[i])<20:
            if i==0:
                text=fmt_pairs(rng.randint(1,10000),[(rng.randint(10,100),rng.randint(1,10)) for _ in range(rng.randint(2,20))])
            elif i==1:
                s=''.join(rng.choice('abc') for _ in range(50));k=rng.randint(1,5)
                targets=[''.join(rng.choice('abcd') for _ in range(k)) for _ in range(12)];text=fmt_fire(s,targets)
            elif i==2:
                n=rng.randint(2,20);cards=[2]*(n-1)+[rng.choice([0,1]) for _ in range(50)];rng.shuffle(cards);text=fmt_bomb(n,cards)
            elif i==3:
                n,m=rng.randint(1,5),rng.randint(1,20);rows=[[rng.randint(1,20) for _ in range(m)] for _ in range(n)];text=fmt_barriers(rows,[rng.randint(1,400) for _ in range(20)])
            elif i==4:
                pairs=[]
                for _ in range(50):
                    a=rng.randint(1,1000);pairs.append((a,rng.randint(a,1000)))
                text=fmt_pairs(rng.randint(1,50),pairs)
            elif i==5:text=fmt_messages(rng.randint(0,6),rng.randint(1,20),sorted(rng.randint(1,100) for _ in range(100)))
            else:
                cities=[rng.randint(0,5) for _ in range(rng.randint(1,10))];cities[0]=max(1,cities[0]);text=fmt_rich(cities,[rng.randint(1,100) for _ in range(20)])
            add(i,text,f'固定种子混合边界 {len(data[i])+1}')
    stress=[[],
        [(fmt_fire('a'*100000,['a'*100]*9999+['b'*100]),'|s|=100000、n=10000、k=100，重复目标及重叠'),
         (fmt_fire('abcde'*20000,['abc','bcd','xyz']),'|s|=100000，周期串')],
        [(fmt_bomb(30000,[0]*270001+[2]*29999),'n=30000、m=300000，大量白板'),
         (fmt_bomb(30000,[1]*270001+[2]*29999),'n=30000、m=300000，大量拆弹与回插')],
        [(fmt_barriers([[1]*5000 for _ in range(100)],[1,5000,5001]*(100000)),'n=100、m=5000、q=300000，等号与失败'),
         (fmt_barriers([[1000]*5000 for _ in range(100)],[5000000,5000001,10**9]),'最大单层伤害及整行和')],
        [(fmt_pairs(100000,[(1,1000)]*100000),'n=m=100000，利润和 99900000'),
         (fmt_pairs(50000,[(1,2),(999,1000)]*50000),'n=100000、m=50000，等利润')],
        [(fmt_messages(100000,10**9,[1]*200000),'n=200000，同时间戳接收前一半'),
         (fmt_messages(1,1,list(range(1,200001))),'n=200000，逐条过期且全接收')],
        [(fmt_rich([0]*99+[1],[10**18]*100000),'n=100、M=100000、P=10^18，稀疏城市'),
         (fmt_rich([100]*100,[10**18]*100000),'n=100、M=100000、P=10^18，持续更新')],
    ]
    return data,stress


def problems():
    ps=definitions();data,stress=make_cases(ps)
    for i,p in enumerate(ps):
        p['tags'].append('来源：学而思')
        group='模考训练 I' if i<4 else '课课练'
        bundle='4ae4a51e4acb1e9bd7761a05dd97f590' if i<4 else '4933aeaee6706ee851f51a05dd97f630'
        url=f'https://www.xiaohoucode.com/login/#/studentcompiler?bundleId={bundle}&classId=76cd83fcab05456183630487ecfea219&lessonId=42838fbc86e3ba0b47a81a05dd97f330'
        note='来自 2026-11-21《限时模考训练 I》，按用户要求归入五级补充练习，不标为 GESP 官方真题。读取时题组标记未发布，用户账号接口可返回题面。平台未返回测试点内容；补充评测数据为自编。大数据详见离线测试包。原平台时间、内存限制单独记录，本地沿用现有执行限制。'
        if i==2:note+=' 原平台样例 3 的 m=20 与 21 个牌面不一致，已保留原文并在样例说明中注明。'
        p.update(id=PREFIX+str(i+1),level=5,session=f'2026-11-21 小猴{group}',number=i+1,kind='supplemental',
                 sampleLabel='原题样例',sampleInput=p['samples'][0]['input'],sampleOutput=p['samples'][0]['output'],
                 cases=[dict(input=text,expected=SOLVERS[i](text)+'\n',score=5,label=label) for text,label in data[i]],
                 casesSource='原题样例 + 自编练习测试点，每题 20 点、每点 5 分；非原平台隐藏评测数据。',
                 extraTests='data/gesp/extra-tests/xiaohou-2026-11-21.zip',timeLimitSeconds=1,memoryLimitMB=256 if i==5 else 128,
                 source=dict(organization='小猴编程',url=url,referenceUrl=url,checkedOn='2026-11-18',edition='题意整理版 · 五级补充练习',note=note))
    return ps,stress


CPP=[r'''
#include <iostream>
using namespace std;
int main(){int n;long long s,answer=0;cin>>n>>s;while(n--){long long p,q;cin>>p>>q;answer+=s%p;s=s/p*q;}cout<<answer+s<<'\n';}
''',r'''
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);string s;int n,k;cin>>s>>n>>k;unordered_map<string,int> count;for(int i=0;i+k<=(int)s.size();i++)++count[s.substr(i,k)];while(n--){string w;cin>>w;cout<<count[w]<<'\n';}}
''',r'''
#include <iostream>
#include <vector>
using namespace std;
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n>>m;vector<int> cards(m),next(n),tokens(n);for(int& x:cards)cin>>x;for(int i=0;i<n;i++)next[i]=(i+1)%n;
int cur=0,prev=n-1,left=n,top=0;while(left>1){int card=cards[top];if(card==2){if(tokens[cur]){--tokens[cur];prev=cur;cur=next[cur];}else{++top;next[prev]=next[cur];cur=next[cur];--left;}}else{++top;if(card==1)++tokens[cur];prev=cur;cur=next[cur];}}cout<<cur+1<<'\n';}
''',r'''
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n>>m;vector<int> weak(m,2000000000);while(n--){vector<int>a(m);for(int&x:a)cin>>x;sort(a.rbegin(),a.rend());int sum=0;for(int j=0;j<m;j++){sum+=a[j];weak[j]=min(weak[j],sum);}}int q;cin>>q;while(q--){int p;cin>>p;int k=lower_bound(weak.begin(),weak.end(),p)-weak.begin();cout<<(k==m?-1:k+1)<<'\n';}}
''',r'''
#include <iostream>
#include <vector>
using namespace std;
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n>>m;vector<int>cnt(1000);while(n--){int a,b;cin>>a>>b;++cnt[b-a];}long long sum=0;for(int d=999;d>=0&&m;--d){int take=min(m,cnt[d]);sum+=1LL*take*d;m-=take;}cout<<sum<<'\n';}
''',r'''
#include <iostream>
#include <vector>
using namespace std;
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;long long k,T;cin>>n>>k>>T;vector<long long> accepted;size_t head=0;while(n--){long long t;cin>>t;while(head<accepted.size()&&accepted[head]<=t-T)++head;if((long long)(accepted.size()-head)<k){accepted.push_back(t);cout<<"Yes\n";}else cout<<"No\n";}}
''',r'''
#include <iostream>
#include <vector>
using namespace std;
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n;vector<long long>a(n);long long sum=0;for(auto&x:a){cin>>x;sum+=x*x;}cin>>m;int city=0;while(m--){long long p;cin>>p;p-=((p-1)/sum)*sum;do{city=(city+1)%n;p-=a[city]*a[city];}while(p>0);cout<<city+1<<'\n';sum+=2*a[city]+1;++a[city];}}
''']


def independent_checks():
    rng=random.Random(110021)
    for _ in range(100):
        # Naive one-city-at-a-time simulation, without whole-lap optimization.
        cities=[rng.randint(0,4) for _ in range(rng.randint(1,7))];cities[0]=max(1,cities[0]);goals=[rng.randint(1,100) for _ in range(12)]
        b=cities[:];pos=0;answers=[]
        for target in goals:
            score=0
            while score<target:pos=(pos+1)%len(b);score+=b[pos]**2
            b[pos]+=1;answers.append(str(pos+1))
        assert rich(fmt_rich(cities,goals))=='\n'.join(answers)
        # Every past accepted message is scanned, including the strict left boundary.
        times=sorted(rng.randint(1,40) for _ in range(20));k=rng.randint(0,5);T=rng.randint(1,20);past=[];answer=[]
        for t in times:
            ok=sum(t-T<p<=t for p in past)<k;answer.append('Yes' if ok else 'No')
            if ok:past.append(t)
        assert messages(fmt_messages(k,T,times))=='\n'.join(answer)
        # Brute-force all deployment permutations independently per crack.
        rows=[[rng.randint(1,10) for _ in range(4)] for _ in range(3)];qs=list(range(1,42));answer=[]
        for q in qs:
            best=[]
            for row in rows:
                choices=[]
                for order in itertools.permutations(row):
                    total=0;stop=5
                    for j,x in enumerate(order,1):
                        total+=x
                        if total>=q:stop=j;break
                    choices.append(stop)
                best.append(min(choices))
            answer.append(str(-1 if max(best)>4 else max(best)))
        assert barriers(fmt_barriers(rows,qs))=='\n'.join(answer)
    sample=definitions()[2]['samples'][2]['input']
    assert bomb(sample)==bomb(sample.replace('\n20\n','\n21\n'))=='5'
    print('Independent naive/permutation checks passed; original bomb sample typo verified.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify',action='store_true');args=parser.parse_args()
    ps,stress=problems()
    if args.verify:
        independent_checks();verify(ps,stress,solvers=SOLVERS,cpp_sources=CPP,archive=ARCHIVE)
    else:
        write_bank(ps,stress,prefix=PREFIX,archive=ARCHIVE,solvers=SOLVERS)
        print('Wrote 7 problems, 140 inline cases, and 152 archive cases.')
