document.addEventListener('DOMContentLoaded', () => {
    // --- 定数定義 ---
    const SUITS = ['s', 'h', 'd', 'c'];
    const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    const HAND_NAMES = {
        10: 'ロイヤルストレートフラッシュ', 9: 'ストレートフラッシュ', 8: 'フォー・オブ・ア・カインド',
        7: 'フルハウス', 6: 'フラッシュ', 5: 'ストレート', 4: 'スリーカード',
        3: 'ツーペア', 2: 'ワンペア', 1: 'ハイカード'
    };
    const RANK_VALUES = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

    // --- DOM要素 ---
    const playerCountSelect = document.getElementById('player-count');
    const runButton = document.getElementById('run-simulation');
    const resetButton = document.getElementById('reset-button');
    const loadingDiv = document.getElementById('loading');
    const currentHandSection = document.getElementById('current-hand-section');
    const myProbSection = document.getElementById('my-prob-section');
    const probTableBody = document.querySelector('#prob-comparison-table tbody');
    let cardInputs = [];
    let stageResults = {};

    // --- メイン処理 ---
    async function runCalculations() {
        const { hand, board, error } = getCardsFromUI();
        if (error) { alert(error); return; }
        if (hand.length < 2) { alert('あなたの手札を2枚入力してください。'); return; }
        
        loadingDiv.classList.remove('hidden');
        clearResults(false); // Clear previous results but keep table structure
        await new Promise(r => setTimeout(r, 50));

        try {
            displayCurrentHand(hand, board);
            displayMyImprovementProb(hand, board);

            if (board.length >= 3) {
                loadingDiv.textContent = 'フロップ時点の確率を計算中...';
                stageResults.flop = await runStageSimulations(hand, board.slice(0, 3));
            }
            if (board.length >= 4) {
                loadingDiv.textContent = 'ターン時点の確率を計算中...';
                stageResults.turn = await runStageSimulations(hand, board.slice(0, 4));
            }
            if (board.length === 5) {
                loadingDiv.textContent = 'リバー時点の確率を計算中...';
                stageResults.river = await runStageSimulations(hand, board.slice(0, 5));
            }

            updateWinRateDisplay();
            updateProbTable();

        } catch (e) {
            console.error(e);
            alert("計算中にエラーが発生しました。");
        } finally {
            loadingDiv.classList.add('hidden');
            loadingDiv.textContent = '計算中...';
        }
    }

    // --- 各機能の表示・計算関数 ---
    
    function displayCurrentHand(hand, board) {
        const knownCards = [...hand, ...board];
        if (knownCards.length < 2) {
             currentHandSection.innerHTML = `<p>現在の役</p><strong>--</strong>`;
             return;
        }
        const currentHand = evaluateHand(knownCards);
        const handName = currentHand.rank > 0 ? HAND_NAMES[currentHand.rank] : "役なし";
        currentHandSection.innerHTML = `<p>現在の暫定役</p><strong>${handName}</strong>`;
    }

    function displayMyImprovementProb(hand, board) {
        const knownCards = [...hand, ...board];
        if (knownCards.length >= 7) {
            myProbSection.innerHTML = ''; return;
        }
        const myTheoryProbs = calculateMyTheoryProb(knownCards);
        myProbSection.innerHTML = createProbList('あなたの役の向上確率 (理論値)', myTheoryProbs, true);
    }

    function updateWinRateDisplay() {
        const stages = ['flop', 'turn', 'river'];
        stages.forEach(stage => {
            const winSpan = document.getElementById(`${stage}-win`);
            const tieSpan = document.getElementById(`${stage}-tie`);
            const loseSpan = document.getElementById(`${stage}-lose`);
            
            const result = stageResults[stage];
            if (result) {
                winSpan.textContent = `${result.winRate.toFixed(2)}%`;
                tieSpan.textContent = `${result.tieRate.toFixed(2)}%`;
                loseSpan.textContent = `${result.lossRate.toFixed(2)}%`;
            } else {
                winSpan.textContent = '--';
                tieSpan.textContent = '--';
                loseSpan.textContent = '--';
            }
        });
    }
    
    function updateProbTable() {
        let tableHTML = '';
        for (let rank = 10; rank >= 1; rank--) {
            tableHTML += `<tr><td>${HAND_NAMES[rank]}</td>`;
            const flopProb = stageResults.flop?.opponentProbs[rank] || 0;
            const turnProb = stageResults.turn?.opponentProbs[rank] || 0;
            const riverProb = stageResults.river?.opponentProbs[rank] || 0;
            
            tableHTML += `<td>${stageResults.flop ? flopProb.toFixed(2) + '%' : '--'}</td>`;
            tableHTML += `<td>${stageResults.turn ? turnProb.toFixed(2) + '%' + createChangeSpan(flopProb, turnProb) : '--'}</td>`;
            tableHTML += `<td>${stageResults.river ? riverProb.toFixed(2) + '%' + createChangeSpan(turnProb, riverProb) : '--'}</td>`;
            tableHTML += `</tr>`;
        }
        probTableBody.innerHTML = tableHTML;
    }

    const createChangeSpan = (before, after) => {
        if (!before) return '';
        const diff = after - before;
        if (Math.abs(diff) < 0.1) return '';
        const symbol = diff > 0 ? '▲' : '▼';
        const className = diff > 0 ? 'prob-up' : 'prob-down';
        return `<span class="prob-change ${className}">(${symbol}${Math.abs(diff).toFixed(2)}%)</span>`;
    };

    // --- シミュレーション実行部 ---
    async function runStageSimulations(hand, board) {
        return runMonteCarlo(hand, board, parseInt(playerCountSelect.value, 10));
    }
    
    // --- UI初期化、リセット、ヘルパー関数など ---
    function initialize() { createCardInputs(); runButton.addEventListener('click', runCalculations); resetButton.addEventListener('click', resetForm); }
    function createCardInputs(){const h=document.getElementById('player-hand-inputs'),b=document.getElementById('board-card-inputs');h.innerHTML='';b.innerHTML='';cardInputs=[];['ハンド1','ハンド2'].forEach(l=>h.appendChild(createSelectorGroup(l)));['フロップ1','フロップ2','フロップ3','ターン','リバー'].forEach(l=>b.appendChild(createSelectorGroup(l)))}
    function createSelectorGroup(l){const c=document.createElement('div');c.className='card-selector';const lb=document.createElement('label');lb.textContent=l;c.appendChild(lb);const w=document.createElement('div');w.className='card-input-wrapper';const s=document.createElement('select');s.className='suit-select';s.innerHTML=`<option value="">-</option><option value="s" class="suit-blue">♠</option><option value="h" class="suit-red">♥</option><option value="d" class="suit-red">♦</option><option value="c" class="suit-blue">♣</option>`;const r=document.createElement('input');r.type='text';r.className='rank-input';r.maxLength=2;w.append(s,r);c.appendChild(w);s.addEventListener('change',()=>{s.className='suit-select';const v=s.value;if(['h','d'].includes(v))s.classList.add('suit-red');if(['s','c'].includes(v))s.classList.add('suit-blue')});r.addEventListener('input',()=>{r.value=r.value.toUpperCase().replace(/[^A-Z0-9]/g,'')});cardInputs.push({suit:s,rank:r});return c}
    function getCardsFromUI(){const h=[],b=[];const seen=new Set();for(let i=0;i<cardInputs.length;i++){const{suit,rank}=cardInputs[i];const s_v=suit.value,r_v=rank.value.toUpperCase();if(s_v&&r_v){if(!RANKS.includes(r_v))return{error:`「${r_v}」は無効なランク`};const card=r_v+s_v;if(seen.has(card))return{error:`カード「${formatCard(card)}」が重複`};seen.add(card);if(i<2)h.push(card);else b.push(card)}}return{hand:h,board:b}}
    function resetForm(){cardInputs.forEach(({suit,rank})=>{suit.value='';rank.value='';suit.className='suit-select'});clearResults(true);}
    function clearResults(fullReset) {
        stageResults = {};
        updateWinRateDisplay();
        updateProbTable();
        currentHandSection.innerHTML = `<p>現在の役</p><strong>--</strong>`;
        myProbSection.innerHTML = '';
        if (fullReset) {
            probTableBody.innerHTML = '';
        }
    }
    const formatCard=c=>c.replace(/s/,'♠').replace(/h/,'♥').replace(/d/,'♦').replace(/c/,'♣');
    const createProbList=(t,p,isMy)=>{let tbl=`<h4>${t}</h4><ul>`;if(isMy&&p['total']){tbl+=`<li>いずれかの役に向上<span class="combo-count">${p['total'].toFixed(2)}%</span></li>`}for(let r=10;r>=1;r--){if(p[r]>0.001){tbl+=`<li>${HAND_NAMES[r]}<span class="combo-count">${p[r].toFixed(2)}%</span></li>`}}return tbl+'</ul>'};
    const isStraight=ranks=>{if(ranks.length<5)return false;const u=Array.from(new Set(ranks)).sort((a,b)=>a-b);if(u.includes(14))u.unshift(1);for(let i=0;i<=u.length-5;i++){if(u[i+4]-u[i]===4&&u[i+1]-u[i]===1&&u[i+2]-u[i]===2&&u[i+3]-u[i]===3)return true}return false};
    // ... (calculateMyTheoryProb, runMonteCarlo, calcProbFromOuts, 役判定関数などは前回から変更なし) ...
    function calculateMyTheoryProb(knownCards){const deck=createDeck();const remainingDeck=deck.filter(c=>!knownCards.includes(c));const currentHand=evaluateHand(knownCards);const cardsToCome=7-knownCards.length;let outs={};for(const rank in HAND_NAMES){outs[rank]=new Set()}for(const card of remainingDeck){const potentialHand=evaluateHand([...knownCards,card]);if(potentialHand.rank>currentHand.rank){outs[potentialHand.rank].add(card)}}for(let i=10;i>1;i--){for(let j=i-1;j>0;j--){outs[j]=new Set([...outs[j]].filter(c=>!outs[i].has(c)))}}const probabilities={};let allOuts=new Set();for(const rank in outs){const outCount=outs[rank].size;if(outCount>0){probabilities[rank]=calcProbFromOuts(outCount,remainingDeck.length,cardsToCome);outs[rank].forEach(c=>allOuts.add(c))}}probabilities['total']=calcProbFromOuts(allOuts.size,remainingDeck.length,cardsToCome);return probabilities}
    function runMonteCarlo(hand,board,playerCount){const SIM_COUNT=5000;let wins=0,ties=0;const opponentHandCounts=Object.keys(HAND_NAMES).reduce((a,k)=>({...a,[k]:0}),{});const knownCards=new Set([...hand,...board]);const deck=createDeck().filter(c=>!knownCards.has(c));for(let i=0;i<SIM_COUNT;i++){const shuffledDeck=shuffleArray([...deck]);const opponentHands=Array.from({length:playerCount-1},()=>shuffledDeck.splice(0,2));const boardCardsToCome=5-board.length;const finalBoard=[...board,...shuffledDeck.splice(0,boardCardsToCome)];const myBestHand=evaluateHand([...hand,...finalBoard]);let bestOpponentHand={rank:0,value:[]};opponentHands.forEach(oppHand=>{const oppBestHand=evaluateHand([...oppHand,...finalBoard]);opponentHandCounts[oppBestHand.rank]++;const comparison=compareHands(oppBestHand,bestOpponentHand);if(comparison>0){bestOpponentHand=oppBestHand}});const finalComparison=compareHands(myBestHand,bestOpponentHand);if(finalComparison>0)wins++;else if(finalComparison===0)ties++}const opponentSimTotal=SIM_COUNT*(playerCount-1);const opponentProbs={};for(const rank in opponentHandCounts){opponentProbs[rank]=(opponentHandCounts[rank]/opponentSimTotal)*100}return{winRate:(wins/SIM_COUNT)*100,tieRate:(ties/SIM_COUNT)*100,lossRate:((SIM_COUNT-wins-ties)/SIM_COUNT)*100,opponentProbs}}
    function calcProbFromOuts(outs,deck,cardsToCome){if(!outs||!deck||!cardsToCome)return 0;if(cardsToCome===1)return(outs/deck)*100;return(1-((deck-outs)/deck)*((deck-1-outs)/(deck-1)))*100}
    const createDeck=()=>RANKS.flatMap(r=>SUITS.map(s=>r+s));const shuffleArray=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
    function evaluateHand(c){if(c.length<1)return{rank:0};if(c.length<5){const d=createDeck().filter(x=>!c.includes(x));c=[...c,...d.slice(0,5-c.length)]}const o=c.map(parseCard);const cm=getCombinations(o,5);let b={rank:0,value:[]};for(const cb of cm){const cr=checkHand(cb);if(compareHands(cr,b)>0){b=cr}}return b}
    function parseCard(cs){const r=cs.slice(0,-1),s=cs.slice(-1);return{rank:r,suit:s,value:RANK_VALUES[r]}}
    function getCombinations(a,sz){const res=[];function c(st,cur){if(cur.length===sz){res.push(cur);return}if(st===a.length)return;c(st+1,[...cur,a[st]]);c(st+1,cur)}c(0,[]);return res}
    function compareHands(a,b){if(a.rank!==b.rank)return a.rank-b.rank;for(let i=0;i<a.value.length;i++){if(a.value[i]!==b.value[i])return a.value[i]-b.value[i]}return 0}
    function checkHand(fc){const sc=fc.sort((a,b)=>b.value-a.value);const v=sc.map(c=>c.value);const s=sc.map(c=>c.suit);const f=s.every(x=>x===s[0]);const u=Array.from(new Set(v));const st=isStraight(v);if(st&&f)return{rank:u.sort((a,b)=>b-a)[0]===14&&u.sort((a,b)=>b-a)[4]===10?10:9,value:v};const cnt=v.reduce((a,x)=>{a[x]=(a[x]||0)+1;return a},{});const ca=Object.values(cnt);const pr=Object.keys(cnt).map(Number).sort((a,b)=>cnt[b]-cnt[a]||b-a);if(ca.includes(4))return{rank:8,value:[pr[0],pr.find(r=>cnt[r]===1)]};if(ca.includes(3)&&ca.includes(2))return{rank:7,value:pr};if(f)return{rank:6,value:v};if(st)return{rank:5,value:u.includes(14)&&u.includes(2)?[5,4,3,2,1]:v};if(ca.includes(3))return{rank:4,value:[pr[0],...pr.slice(1,3)]};if(ca.filter(c=>c===2).length===2)return{rank:3,value:[pr[0],pr[1],pr.find(r=>cnt[r]===1)]};if(ca.includes(2))return{rank:2,value:[pr[0],...pr.slice(1,4)]};return{rank:1,value:v}}
    
    initialize();
});