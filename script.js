(() => {
  const $ = id => document.getElementById(id);
  const symbols = {wk:"♔",wq:"♕",wr:"♖",wb:"♗",wn:"♘",wp:"♙",bk:"♚",bq:"♛",br:"♜",bb:"♝",bn:"♞",bp:"♟"};
  const notes = ["A relaxed opponent that leaves plenty of chances.","A casual opponent with basic tactical awareness.","A club-style bot that searches several moves ahead.","A strong bot with deeper tactical and positional search.","The strongest setting, prioritizing the best engine-scored move."];
  let game = new Chess(), selected = null, legal = [], flipped = false, thinking = false;
  let lastMove = null, history = [], gameStartRating = 200, movesAnalyzed = 0;
  let stats = JSON.parse(localStorage.getItem("chesslabStats") || '{"rating":200,"games":0,"wins":0,"analyzed":0}');
  const depthFor = level => [1,2,3,3,4][level-1];
  let transposition = new Map();
  function saveStats(){localStorage.setItem("chesslabStats",JSON.stringify(stats));updateRating();}
  function updateRating(){
    const r=Math.max(0,Math.round(stats.rating));
    $("ratingValue").textContent=r; $("gamesPlayed").textContent=stats.games; $("gamesWon").textContent=stats.wins; $("movesAnalyzed").textContent=stats.analyzed;
    $("rankLabel").textContent=r<200?"Beginner":r<600?"Intermediate":"Master";
    $("meterFill").style.width=Math.min(100,r/10)+"%";
  }
  function render(){
    const board=$("board"); board.innerHTML="";
    for(let row=0;row<8;row++) for(let col=0;col<8;col++){
      const file=flipped?7-col:col, rank=flipped?row+1:8-row, sq="abcdefgh"[file]+rank;
      const piece=game.get(sq), el=document.createElement("button");
      el.className="square "+(((row+col)%2===0)?"light":"dark");
      if(selected===sq)el.classList.add("selected");
      if(lastMove&&(lastMove.from===sq||lastMove.to===sq))el.classList.add("last");
      if(legal.some(m=>m.to===sq))el.classList.add(piece?"capture":"legal");
      el.setAttribute("aria-label",sq+(piece?" "+piece.type:""));
      if(piece){el.textContent=symbols[piece.color+piece.type];el.classList.add(piece.color==="w"?"piece-white":"piece-black");}
      el.addEventListener("click",()=>onSquare(sq)); board.appendChild(el);
    }
    $("turnLabel").textContent=game.game_over()?"Game finished":(game.turn()==="w"?"Your turn · White":"Bot thinking · Black");
    renderMoves();
  }
  function renderMoves(){
    const list=$("moveList"), hist=game.history();
    $("moveCount").textContent=hist.length+" plies";
    if(!hist.length){list.innerHTML='<div class="empty-state">Your moves will appear here.</div>';return;}
    let html=""; for(let i=0;i<hist.length;i+=2) html+=`<div class="move-entry"><span>${i/2+1}.</span><strong>${hist[i]||""}</strong><strong>${hist[i+1]||""}</strong></div>`;
    list.innerHTML=html;list.scrollTop=list.scrollHeight;
  }
  function onSquare(sq){
    if(thinking||game.game_over()||game.turn()!=="w")return;
    const p=game.get(sq);
    if(selected&&legal.some(m=>m.to===sq)){
      const move=game.move({from:selected,to:sq,promotion:"q"});
      if(move){lastMove={from:move.from,to:move.to};selected=null;legal=[];render();afterHumanMove();}
      return;
    }
    if(p&&p.color==="w"){selected=sq;legal=game.moves({square:sq,verbose:true});}
    else{selected=null;legal=[];}
    render();
  }
  function evaluate(g){
    const values={p:100,n:325,b:335,r:500,q:950,k:0}; let score=0;
    const b=g.board();
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const p=b[r][c]; if(!p)continue;
      let v=values[p.type];
      const center=3.5-(Math.abs(3.5-r)+Math.abs(3.5-c))/2;
      if(p.type==="n")v+=center*13;
      if(p.type==="b")v+=center*8;
      if(p.type==="p"){
        const advance=p.color==="w"?(6-r):(r-1);
        v+=advance*7;
        if(c>=2&&c<=5)v+=5;
      }
      if(p.type==="r"&&(r===1||r===6))v+=12;
      if(p.type==="q")v+=center*2;
      score+=(p.color==="b"?v:-v);
    }
    const side=g.turn(), mobility=g.moves().length;
    score+=(side==="b"?1:-1)*Math.min(mobility,35)*2;
    if(g.in_check())score+=(g.turn()==="w"?45:-45);
    return score;
  }
  function orderedMoves(g){
    const moves=g.moves({verbose:true});
    const pieceValue={p:100,n:325,b:335,r:500,q:950,k:20000};
    const moveScore=m=>{
      let s=0;
      if(m.captured)s+=10*pieceValue[m.captured]-pieceValue[m.piece];
      if(m.promotion)s+=pieceValue[m.promotion];
      if(m.flags&&(m.flags.includes("k")||m.flags.includes("q")))s+=35;
      return s;
    };
    moves.sort((a,b)=>moveScore(b)-moveScore(a));
    return moves;
  }
  function minimax(g,depth,alpha,beta,ply=0){
    if(g.in_checkmate())return g.turn()==="b"?-100000+ply:100000-ply;
    if(g.in_draw())return 0;
    if(depth===0)return evaluate(g);
    const key=g.fen()+"|"+depth;
    const cached=transposition.get(key);
    if(cached!==undefined)return cached;
    const moves=orderedMoves(g);
    if(!moves.length)return evaluate(g);
    let best=g.turn()==="b"?-Infinity:Infinity;
    if(g.turn()==="b"){
      for(const m of moves){
        g.move({from:m.from,to:m.to,promotion:m.promotion||"q"});
        const value=minimax(g,depth-1,alpha,beta,ply+1);
        g.undo(); best=Math.max(best,value); alpha=Math.max(alpha,best);
        if(beta<=alpha)break;
      }
    }else{
      for(const m of moves){
        g.move({from:m.from,to:m.to,promotion:m.promotion||"q"});
        const value=minimax(g,depth-1,alpha,beta,ply+1);
        g.undo(); best=Math.min(best,value); beta=Math.min(beta,best);
        if(beta<=alpha)break;
      }
    }
    if(transposition.size>60000)transposition.clear();
    transposition.set(key,best);
    return best;
  }
  function chooseBotMove(){
    const level=Number($("difficulty").value), depth=depthFor(level);
    const moves=orderedMoves(game);
    let scored=[];
    transposition.clear();
    for(const m of moves){
      game.move({from:m.from,to:m.to,promotion:m.promotion||"q"});
      const score=minimax(game,depth-1,-Infinity,Infinity,1);
      game.undo();
      scored.push({m,score});
    }
    scored.sort((a,b)=>b.score-a.score);
    const pool=level===1?scored.slice(0,Math.max(1,Math.ceil(scored.length*.7))):
      level===2?scored.slice(0,Math.max(1,Math.ceil(scored.length*.4))):
      level===3?scored.slice(0,Math.max(1,Math.ceil(scored.length*.18))):
      level===4?scored.slice(0,Math.min(2,scored.length)):scored.slice(0,1);
    return pool[Math.floor(Math.random()*pool.length)].m;
  }
  function afterHumanMove(){
    if(game.game_over()){finishGame();return;}
    thinking=true;$("gameMessage").textContent="Bot is calculating its reply…";render();
    setTimeout(()=>{
      const move=chooseBotMove();if(move){const played=game.move({from:move.from,to:move.to,promotion:"q"});lastMove={from:played.from,to:played.to};}
      thinking=false;render();
      if(game.game_over())finishGame();else $("gameMessage").textContent="Your move. Try to make each move count.";
    },120);
  }
  function finishGame(){
    let result=game.in_checkmate()?(game.turn()==="w"?"Bot wins by checkmate.":"You win by checkmate!"): "Draw game.";
    $("gameMessage").textContent=result;
    stats.games++;
    if(game.in_checkmate()&&game.turn()==="b"){stats.wins++;stats.rating+=35;}
    else if(game.in_checkmate()&&game.turn()==="w"){stats.rating=Math.max(0,stats.rating-18);}
    else stats.rating+=3;
    saveStats();
  }
  function newGame(){
    game.reset();selected=null;legal=[];lastMove=null;thinking=false;history=[];gameStartRating=stats.rating;
    $("gameMessage").textContent="New game started. You play White.";render();
  }
  $("newGame").addEventListener("click",newGame);
  $("difficulty").addEventListener("change",e=>{$("botLabel").textContent=["Beginner","Casual","Club level","Advanced","Expert"][e.target.value-1]+" · Level "+e.target.value;$("difficultyNote").textContent=notes[e.target.value-1];});
  $("flipBoard").addEventListener("click",()=>{flipped=!flipped;render();});
  $("undo").addEventListener("click",()=>{if(thinking)return;let n=0;if(game.history().length){game.undo();n++;}if(game.history().length&&game.turn()==="b"){game.undo();n++;}selected=null;legal=[];lastMove=null;$("gameMessage").textContent=n?"Last turn taken back.":"There are no moves to undo.";render();});
  $("resign").addEventListener("click",()=>{if(game.game_over()||!game.history().length)return;game.load(game.fen());stats.games++;stats.rating=Math.max(0,stats.rating-18);saveStats();$("gameMessage").textContent="You resigned. Start a new game when ready.";thinking=true;});
  updateRating();render();
})();