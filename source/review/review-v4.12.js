/* ═══════════════════════════════════════════════════════════════
   review-v4.12.js — логика «сервиса правок» (внешний файл для Tilda)

   Подключение (в блоке Tilda, ПОСЛЕ этих файлов):
     firebase-app-compat.js, firebase-firestore-compat.js,
     firebase-auth-compat.js, Cloudflare Stream sdk.latest.js
   Конфиг страницы задаётся в блоке через window.REVIEW_CONFIG.

   Обновление: залей новую версию review-vN.js на GitHub, поменяй
   номер в подключении (можно ?v=2 для сброса кэша jsdelivr).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function boot() {
    var CFG = window.REVIEW_CONFIG || {};

    /* ── Редактируемое из блока Tilda ── */
    var PROJECT_ID    = CFG.PROJECT_ID    || "test";
    var PROJECT_TITLE = CFG.PROJECT_TITLE || "Проект";
    var PROJECT_BADGE = CFG.PROJECT_BADGE || "";
    var VIDEO_UID     = CFG.VIDEO_UID     || "";
    var HEADER_HEIGHT = CFG.HEADER_HEIGHT || "80px";
    var NOTES_TITLE   = CFG.NOTES_TITLE   || "";
    var NOTES_TEXT    = CFG.NOTES_TEXT    || "";
    var CLIENT_CODE   = CFG.CLIENT_CODE   || "6282";
    var INSTR_TITLE   = CFG.INSTR_TITLE   || "Как пользоваться сервисом";
    var NOTIFY_URL    = CFG.NOTIFY_URL    || "";
    var WELCOME_STEPS = CFG.WELCOME_STEPS || [
      { icon:"eye",    text:"Смотрите видео и оставляйте комментарии. Можно прокомментировать видео в целом, а можно выбрать конкретный момент — поставьте плеер на нужную секунду, и время само подставится к правке." },
      { icon:"clock",  text:"Чтобы включить привязку комментария ко времени, активируйте часики: если они стали жёлтыми — привязка включена." },
      { icon:"pencil", text:"Вы можете рисовать правки прямо поверх видео — мы их увидим. Просто включите карандашик и выберите цвет." },
      { icon:"chat",   text:"В блоке слева отображаются ваши правки, а также наши ответы на них." },
      { icon:"save",   text:"Всё сохраняется автоматически, возвращайтесь по своей ссылке в любой момент." }
    ];

    /* ── Технические (общие для всех страниц) ── */
    var firebaseConfig = {
      apiKey: "AIzaSyAQ0FtxgyNwhAjOrrLif9gYa8_9TKh6Acs",
      authDomain: "forest-review.firebaseapp.com",
      projectId: "forest-review",
      storageBucket: "forest-review.firebasestorage.app",
      messagingSenderId: "224764827057",
      appId: "1:224764827057:web:8da740fdb084d278251990"
    };
    var CF_CUSTOMER = "customer-egq9cv7h8deqpmf4";
    var ADMIN_EMAIL = "info@oforestmedia.ru";
    var ADMIN_NAME  = "Forest Production";
    var STROKE_W = 0.006;
    var ICON_BASE = "https://cdn.jsdelivr.net/gh/SASHA25111/forest@main/source/icons/";
    var CLIENT_AVATARS = ["icons1","icons2","icons3","icons4","icons5","icons6"];
    var ADMIN_AVATAR = "icons8";

    function avatarUrl(id){ return ICON_BASE + id + "_00000.jpg"; }
    function avatarHTML(id, r){
      var use = id;
      if(!use || (CLIENT_AVATARS.indexOf(use)<0 && use!==ADMIN_AVATAR)) use = (r==="performer" ? ADMIN_AVATAR : CLIENT_AVATARS[0]);
      return '<img src="'+avatarUrl(use)+'" alt="" loading="lazy">';
    }

    var SVG = {
      play:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
      pause:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
      fs:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>',
      pencil:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
    };
    var ICON = {
      eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
      clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
      chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/></svg>',
      save:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>'
    };

    var params = new URLSearchParams(location.search);
    var projectId = params.get("p") || PROJECT_ID;

    /* ── Firebase (compat) ── */
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    var db = firebase.firestore();
    var auth = firebase.auth();
    var commentsRef = db.collection("projects").doc(projectId).collection("comments");

    function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]; }); }
    function fmt(s){ s=Math.max(0,Math.floor(s||0)); var m=Math.floor(s/60), ss=s%60; return (m<10?"0":"")+m+":"+(ss<10?"0":"")+ss; }

    /* ── Личность / вход ── */
    var author="", role="", avatar="", authUser=null, lastItems=[];
    function resolveIdentity(){
      if(authUser && authUser.email===ADMIN_EMAIL){ role="performer"; author=ADMIN_NAME; avatar=ADMIN_AVATAR; }
      else { var n=localStorage.getItem("rv_name"); if(n){ role="client"; author=n; avatar=localStorage.getItem("rv_avatar")||CLIENT_AVATARS[0]; } else { role=""; author=""; avatar=""; } }
      renderAuth(); renderFormState(); renderList(); updateGate();
    }
    auth.onAuthStateChanged(function(u){ authUser=u; resolveIdentity(); });
    function doLogout(){ localStorage.removeItem("rv_name"); if(authUser){ auth.signOut().catch(function(){}); } authUser=null; clearReply(); resolveIdentity(); }

    var authArea=document.getElementById("authArea");
    function renderAuth(){
      if(role){
        var lbl=role==="performer"?"исполнитель":"клиент";
        authArea.innerHTML='<span class="rv__av">'+avatarHTML(avatar,role)+'</span> <b>'+esc(author)+'</b> · '+lbl+' <button class="rv__link" id="logout">Выйти</button>';
        document.getElementById("logout").addEventListener("click", doLogout);
      } else { authArea.innerHTML=""; }
    }

    /* ── Стартовое окно (гейт) ── */
    var gate=document.getElementById("gate"), gClient=document.getElementById("gClient"), gAdmin=document.getElementById("gAdmin");
    var gName=document.getElementById("gName"), gClientBtn=document.getElementById("gClientBtn"), gClientErr=document.getElementById("gClientErr");
    var gKey=document.getElementById("gKey"), gErr=document.getElementById("gErr"), gAdminBtn=document.getElementById("gAdminBtn");
    var gAvatars=document.getElementById("gAvatars");
    var codeInputs=Array.prototype.slice.call(document.querySelectorAll("#gCode input"));

    function showClient(){ gClient.style.display="block"; gAdmin.style.display="none"; }
    function showAdmin(){ gClient.style.display="none"; gAdmin.style.display="block"; gErr.style.display="none"; setTimeout(function(){gKey.focus();},50); }
    function updateGate(){
      var authed=!!role;
      gate.style.display = authed ? "none" : "flex";
      document.body.classList.toggle("locked", !authed);
      if(!authed) showClient();
    }
    document.getElementById("gToAdmin").addEventListener("click", showAdmin);
    document.getElementById("gBack").addEventListener("click", showClient);

    /* Аватары */
    var selectedAvatar = localStorage.getItem("rv_avatar") || "";
    if(selectedAvatar && CLIENT_AVATARS.indexOf(selectedAvatar)<0) selectedAvatar = "";
    function renderAvatars(){
      gAvatars.classList.toggle("has-sel", !!selectedAvatar);
      gAvatars.innerHTML = CLIENT_AVATARS.map(function(id){ return '<button class="rv__avopt'+(id===selectedAvatar?" active":"")+'" data-av="'+id+'"><img src="'+avatarUrl(id)+'" alt="" loading="lazy"></button>'; }).join("");
      Array.prototype.forEach.call(gAvatars.querySelectorAll(".rv__avopt"), function(b){ b.addEventListener("click", function(){ selectedAvatar=b.getAttribute("data-av"); renderAvatars(); }); });
    }
    renderAvatars();

    /* Код доступа */
    function codeValue(){ return codeInputs.map(function(i){ return i.value; }).join(""); }
    function updateClientBtn(){ gClientBtn.disabled = !(gName.value.trim() && codeValue().length===4); }
    codeInputs.forEach(function(inp,idx){
      inp.addEventListener("input", function(){
        inp.value = inp.value.replace(/\D/g,"").slice(0,1);
        if(inp.value && idx<codeInputs.length-1) codeInputs[idx+1].focus();
        gClientErr.style.display="none"; updateClientBtn();
      });
      inp.addEventListener("keydown", function(e){
        if(e.key==="Backspace" && !inp.value && idx>0) codeInputs[idx-1].focus();
        else if(e.key==="Enter") tryClientLogin();
      });
    });
    gName.addEventListener("input", updateClientBtn);
    gName.addEventListener("keydown", function(e){ if(e.key==="Enter" && codeValue().length===4) tryClientLogin(); });

    function tryClientLogin(){
      if(!gName.value.trim() || codeValue().length!==4) return;
      if(codeValue()!==CLIENT_CODE){ gClientErr.textContent="Неверный код доступа"; gClientErr.style.display="block"; codeInputs.forEach(function(i){i.value="";}); codeInputs[0].focus(); updateClientBtn(); return; }
      var av = selectedAvatar || CLIENT_AVATARS[0];
      localStorage.setItem("rv_name", gName.value.trim());
      localStorage.setItem("rv_avatar", av);
      resolveIdentity();
    }
    gClientBtn.addEventListener("click", tryClientLogin);

    function loginAdmin(){
      var code=gKey.value.trim(); if(!code) return;
      gErr.style.display="none"; gAdminBtn.disabled=true; gAdminBtn.textContent="Проверка…";
      auth.signInWithEmailAndPassword(ADMIN_EMAIL, code).then(function(){ /* onAuthStateChanged скроет гейт */ }).catch(function(e){
        gErr.textContent=(e.code==="auth/invalid-credential"||e.code==="auth/invalid-login-credentials"||e.code==="auth/wrong-password"||e.code==="auth/user-not-found")?"Неверный код":"Ошибка входа: "+(e.code||e.message);
        gErr.style.display="block"; gKey.value=""; gKey.focus();
      }).then(function(){ gAdminBtn.disabled=false; gAdminBtn.textContent="Войти"; });
    }
    gAdminBtn.addEventListener("click", loginAdmin);
    gKey.addEventListener("keydown", function(e){ if(e.key==="Enter") loginAdmin(); });

    /* ── Плеер + контролы + бегунок ── */
    var iframe=document.getElementById("sp");
    iframe.src="https://"+CF_CUSTOMER+".cloudflarestream.com/"+VIDEO_UID+"/iframe?controls=false";
    var playerEl=document.getElementById("player");
    var playBtn=document.getElementById("play"), fsBtn=document.getElementById("fs");
    var curEl=document.getElementById("cur"), durEl=document.getElementById("dur");
    var sb=document.getElementById("sb"), sbFill=document.getElementById("sbFill"), sbHead=document.getElementById("sbHead");
    var player=null, liveTime=0, duration=0, dragging=false, playing=false, marks=[];
    playBtn.innerHTML=SVG.play; fsBtn.innerHTML=SVG.fs;

    (function wait(){ window.Stream ? initPlayer() : setTimeout(wait,120); })();
    function initPlayer(){
      player=window.Stream(iframe);
      player.addEventListener("play", function(){ playing=true; playBtn.innerHTML=SVG.pause; clearView(); });
      player.addEventListener("pause", function(){ playing=false; playBtn.innerHTML=SVG.play; });
      player.addEventListener("loadedmetadata", grabDuration);
      player.addEventListener("durationchange", grabDuration);
      player.addEventListener("timeupdate", function(){ liveTime=player.currentTime||0; if(!dragging) updateProgress(liveTime); if(attach && !pinned && !replyTo && !drawMode) setChip(liveTime); });
      player.addEventListener("seeked", function(){ if(player){ liveTime=player.currentTime||liveTime; updateProgress(liveTime); if(attach && !pinned && !replyTo && !drawMode) setChip(liveTime); } });
      var tries=0; var t=setInterval(function(){ grabDuration(); if(duration||++tries>40) clearInterval(t); },400);
    }
    function grabDuration(){ var d=player&&player.duration; if(d&&isFinite(d)&&d>0&&d!==duration){ duration=d; durEl.textContent=fmt(d); renderMarks(); } }
    function updateProgress(t){ curEl.textContent=fmt(t); if(duration>0){ var p=Math.max(0,Math.min(100,t/duration*100)); sbFill.style.width=p+"%"; sbHead.style.left=p+"%"; } }
    function seekTo(sec){ if(!player) return; try{ player.currentTime=sec; }catch(e){} liveTime=sec; if(attach && !pinned && !replyTo && !drawMode) setChip(sec); updateProgress(sec); }

    playBtn.addEventListener("click", function(){ if(!player) return; try{ playing?player.pause():player.play(); }catch(e){} });
    fsBtn.addEventListener("click", function(){ var el=playerEl.parentElement; if(!document.fullscreenElement){ (el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el); } else { (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document); } });
    function seekFromEvent(e){
      var r=sb.getBoundingClientRect(); var p=(e.clientX-r.left)/r.width; p=Math.max(0,Math.min(1,p)); var t=p*(duration||0);
      liveTime=t; if(attach && !pinned && !replyTo && !drawMode) setChip(t);
      updateProgress(t); if(player){ try{ player.currentTime=t; }catch(_){} } clearView();
    }
    sb.addEventListener("pointerdown", function(e){ if(!duration) return; dragging=true; sb.setPointerCapture(e.pointerId); seekFromEvent(e); });
    sb.addEventListener("pointermove", function(e){ if(dragging) seekFromEvent(e); });
    sb.addEventListener("pointerup", function(){ dragging=false; });
    sb.addEventListener("pointercancel", function(){ dragging=false; });
    function renderMarks(){
      Array.prototype.forEach.call(sb.querySelectorAll(".rv__mark"), function(n){ n.remove(); });
      if(!duration) return;
      marks.forEach(function(m){
        var el=document.createElement("span"); el.className="rv__mark"+(m.draw?" rv__mark--draw":"");
        el.style.left=(m.t/duration*100)+"%"; el.title=fmt(m.t)+" · "+m.label+(m.draw?" ✎":"");
        el.addEventListener("pointerdown", function(ev){ ev.stopPropagation(); });
        el.addEventListener("click", function(ev){ ev.stopPropagation(); if(m.draw){ showView(m.t, m.strokes); } else { seekTo(m.t); try{player.pause();}catch(_){} } });
        sb.appendChild(el);
      });
    }

    /* ── Canvas: рисование и просмотр ── */
    var cv=document.getElementById("cv");
    var drawMode=false, composeStrokes=[], curColor="#ff3b30", drawing=false, curStroke=null, viewStrokes=null;
    function fitCanvas(){ var r=playerEl.getBoundingClientRect(); var dpr=window.devicePixelRatio||1; cv.width=Math.max(1,Math.round(r.width*dpr)); cv.height=Math.max(1,Math.round(r.height*dpr)); renderCanvas(); }
    function renderCanvas(){
      var ctx=cv.getContext("2d"); ctx.clearRect(0,0,cv.width,cv.height);
      var strokes = drawMode ? composeStrokes : viewStrokes;
      if(!strokes) return;
      strokes.forEach(function(s){
        var pts=s.points; if(!pts||pts.length<2) return;
        ctx.strokeStyle=s.color; ctx.lineWidth=Math.max(1.5,(s.width||STROKE_W)*cv.width); ctx.lineCap="round"; ctx.lineJoin="round";
        ctx.beginPath();
        for(var i=0;i<pts.length;i+=2){ var x=pts[i]*cv.width, y=pts[i+1]*cv.height; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
        ctx.stroke();
      });
    }
    function ptFromEvent(e){ var r=cv.getBoundingClientRect(); var x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)); return [Math.round(x*1000)/1000, Math.round(y*1000)/1000]; }
    cv.addEventListener("pointerdown", function(e){ if(!drawMode) return; try{player.pause();}catch(_){} drawing=true; cv.setPointerCapture(e.pointerId); var p=ptFromEvent(e); curStroke={color:curColor,width:STROKE_W,points:[p[0],p[1]]}; composeStrokes.push(curStroke); renderCanvas(); });
    cv.addEventListener("pointermove", function(e){ if(!drawMode||!drawing) return; var p=ptFromEvent(e); curStroke.points.push(p[0],p[1]); renderCanvas(); });
    cv.addEventListener("pointerup", function(){ drawing=false; curStroke=null; updateSendState(); });
    cv.addEventListener("pointercancel", function(){ drawing=false; curStroke=null; });

    var drawBtn=document.getElementById("drawBtn"), drawbar=document.getElementById("drawbar");
    drawBtn.innerHTML=SVG.pencil;
    function setDrawMode(on){
      drawMode=on; drawBtn.classList.toggle("active",on);
      cv.style.pointerEvents = on ? "auto":"none";
      drawbar.style.display = on ? "flex":"none";
      if(on){ viewStrokes=null; try{player.pause();}catch(_){} }
      else { composeStrokes=[]; }
      renderCanvas(); updateSendState();
    }
    drawBtn.addEventListener("click", function(){ setDrawMode(!drawMode); });
    Array.prototype.forEach.call(drawbar.querySelectorAll(".rv__sw"), function(b){ b.addEventListener("click", function(){ curColor=b.getAttribute("data-color"); Array.prototype.forEach.call(drawbar.querySelectorAll(".rv__sw"), function(x){x.classList.remove("active");}); b.classList.add("active"); }); });
    drawbar.querySelector(".rv__sw").classList.add("active");
    document.getElementById("drawUndo").addEventListener("click", function(){ composeStrokes.pop(); renderCanvas(); updateSendState(); });
    document.getElementById("drawClear").addEventListener("click", function(){ composeStrokes=[]; renderCanvas(); updateSendState(); });

    function showView(tSec, strokes){ setDrawMode(false); viewStrokes=strokes; seekTo(tSec); try{player.pause();}catch(_){} renderCanvas(); }
    function clearView(){ if(viewStrokes){ viewStrokes=null; renderCanvas(); } }
    window.addEventListener("resize", fitCanvas);
    document.addEventListener("fullscreenchange", function(){ setTimeout(fitCanvas,80); });

    /* ── Ввод + ответы ── */
    var ta=document.getElementById("ta"), sendBtn=document.getElementById("send");
    var pin=document.getElementById("pin"), pinT=document.getElementById("pinT");
    var replyctx=document.getElementById("replyctx"), replyName=document.getElementById("replyName");
    var attach=false, pinned=false, pinnedTime=0, replyTo=null;
    function setChip(t){ if(attach) pinT.textContent=fmt(t); }
    function updateSendState(){ var has = ta.value.trim().length>0 || (drawMode && composeStrokes.length>0); sendBtn.disabled = !role || !has; }
    function renderFormState(){
      if(role){ ta.disabled=false; ta.placeholder = replyTo ? "Ваш ответ…" : "Оставьте комментарий…"; }
      else { ta.disabled=true; ta.value=""; ta.placeholder="Оставьте комментарий…"; if(drawMode) setDrawMode(false); clearReply(); }
      updateSendState();
    }
    pin.addEventListener("click", function(){
      if(replyTo) return;
      attach=!attach; pin.classList.toggle("off",!attach);
      if(attach){ pinned=false; pinnedTime=liveTime; pinT.textContent=fmt(liveTime); }
      else { pinT.textContent="включить таймкод"; pinned=false; }
    });
    ta.addEventListener("focus", function(){ if(role && attach && !pinned && !replyTo && !drawMode){ pinnedTime=liveTime; pinned=true; setChip(pinnedTime); } });
    ta.addEventListener("input", function(){ updateSendState(); if(role && attach && !pinned && !replyTo && !drawMode){ pinnedTime=liveTime; pinned=true; setChip(pinnedTime); } });
    function setReply(id,name){ setDrawMode(false); replyTo={id:id,name:name}; replyName.textContent=name; replyctx.style.display="flex"; pin.classList.add("hidden"); ta.placeholder="Ваш ответ…"; ta.focus(); }
    function clearReply(){ replyTo=null; replyctx.style.display="none"; pin.classList.remove("hidden"); if(role) ta.placeholder="Оставьте комментарий…"; pinned=false; if(!attach) pinT.textContent="включить таймкод"; }
    document.getElementById("replyCancel").addEventListener("click", clearReply);

    function notifyEmail(payload){
      if(!NOTIFY_URL) return Promise.resolve();
      return fetch(NOTIFY_URL, { method:"POST", mode:"no-cors", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).catch(function(){});
    }
    function send(){
      var text=ta.value.trim();
      var hasDraw = drawMode && composeStrokes.length>0;
      if((!text && !hasDraw) || !role) return;
      sendBtn.disabled=true;
      var oldLabel = sendBtn.textContent; sendBtn.textContent = "Отправка…";
      var tSec = replyTo ? null : (attach ? Math.round((pinned?pinnedTime:liveTime)*10)/10 : null);
      if(hasDraw && tSec==null) tSec = Math.round(liveTime*10)/10;
      var parentId = replyTo ? replyTo.id : null;
      var notifyText = text || "(рисунок)";
      var started = Date.now();
      commentsRef.add({
        text: text || "(рисунок)", author:author, role:role, avatar:avatar,
        parentId: parentId, tSec: tSec,
        drawing: hasDraw ? { strokes: composeStrokes.map(function(s){ return {color:s.color, width:s.width, points:s.points.slice()}; }) } : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function(){
        if(role==="client"){ return notifyEmail({ project: projectId, author:author, text:notifyText, tSec:tSec, parentId:parentId, drawing:hasDraw, pageUrl:location.href }); }
      }).then(function(){
        var elapsed = Date.now() - started;
        return new Promise(function(r){ setTimeout(r, Math.max(0, 1500 - elapsed)); });
      }).then(function(){
        ta.value=""; setDrawMode(false); clearReply();
      }).catch(function(e){ alert("Не удалось отправить: "+e.message); }).then(function(){
        sendBtn.textContent = oldLabel; updateSendState();
      });
    }
    sendBtn.addEventListener("click", send);
    ta.addEventListener("keydown", function(e){ if((e.metaKey||e.ctrlKey)&&e.key==="Enter") send(); });

    /* ── Лента + сортировка ── */
    var list=document.getElementById("list"), cCount=document.getElementById("cCount"), sortBtn=document.getElementById("sortBtn");
    var sortNewest = localStorage.getItem("rv_sort")==="new";
    function renderSortBtn(){ sortBtn.textContent = sortNewest ? "↓ Сначала новые" : "↑ Сначала старые"; }
    sortBtn.addEventListener("click", function(){ sortNewest=!sortNewest; localStorage.setItem("rv_sort", sortNewest?"new":"old"); renderSortBtn(); renderList(); });
    renderSortBtn();

    function fmtWhen(ts){
      if(!ts) return "…";
      var d = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
      function p(n){ return (n<10?"0":"")+n; }
      return p(d.getDate())+"."+p(d.getMonth()+1)+" "+d.getHours()+":"+p(d.getMinutes());
    }
    function replyBtnHTML(rootId,c){ return role ? '<button class="rv__reply-btn" data-rid="'+rootId+'" data-rname="'+esc(c.author)+'">Ответить</button>' : ""; }
    function commentHTML(c, rootId, isReply){
      var rl=c.role==="performer"?"performer":"client", rlLabel=rl==="performer"?"исполнитель":"клиент";
      var pencil = c.drawing ? "✎ " : "";
      var tc = isReply ? "" : (c.tSec==null ? '<span class="rv__tc rv__tc--none">общий</span>' : '<button class="rv__tc" data-id="'+c.id+'" data-t="'+c.tSec+'">'+pencil+fmt(c.tSec)+'</button>');
      var av = '<span class="rv__av">'+avatarHTML(c.avatar, rl)+'</span>';
      return '<div class="rv__c'+(isReply?" rv__c--reply":"")+'"><div class="rv__c-top">'+tc+av
        + '<span class="rv__au">'+esc(c.author)+'</span><span class="rv__rl rv__rl--'+rl+'">'+rlLabel+'</span>'
        + '<span class="rv__ago">'+fmtWhen(c.createdAt)+'</span></div><div class="rv__txt">'+esc(c.text)+'</div>'+replyBtnHTML(rootId,c)+'</div>';
    }
    function cms(a){ return (a.createdAt&&a.createdAt.toMillis)?a.createdAt.toMillis():Infinity; }
    function renderList(){
      var items=lastItems, byId={}; items.forEach(function(c){ byId[c.id]=c; });
      var roots=items.filter(function(c){ return !c.parentId; }).sort(function(a,b){ return sortNewest ? cms(b)-cms(a) : cms(a)-cms(b); });
      var byParent={}; items.filter(function(c){ return c.parentId; }).forEach(function(c){ (byParent[c.parentId] = byParent[c.parentId]||[]).push(c); });
      Object.keys(byParent).forEach(function(k){ byParent[k].sort(function(x,y){ return cms(x)-cms(y); }); });
      cCount.textContent=items.length;
      marks = items.filter(function(c){ return !c.parentId && c.tSec!=null; }).map(function(c){ return { t:c.tSec, label:c.author, draw:!!c.drawing, strokes:c.drawing?c.drawing.strokes:null }; });
      renderMarks();
      if(!items.length){ list.innerHTML='<div class="rv__empty">Пока правок нет.<br>Поставьте видео на нужный момент и оставьте комментарий ниже.</div>'; return; }
      list.innerHTML = roots.map(function(r){ var h=commentHTML(r,r.id,false); (byParent[r.id]||[]).forEach(function(rep){ h+=commentHTML(rep,r.id,true); }); return h; }).join("");
      Array.prototype.forEach.call(list.querySelectorAll(".rv__tc[data-t]"), function(b){ b.addEventListener("click", function(){
        var c=byId[b.getAttribute("data-id")], t=parseFloat(b.getAttribute("data-t"));
        if(c && c.drawing){ showView(t, c.drawing.strokes); } else { seekTo(t); try{player.pause();}catch(_){} }
      }); });
      Array.prototype.forEach.call(list.querySelectorAll(".rv__reply-btn"), function(b){ b.addEventListener("click", function(){ if(!role) return; setReply(b.getAttribute("data-rid"), b.getAttribute("data-rname")); }); });
    }
    commentsRef.onSnapshot(function(snap){ lastItems=snap.docs.map(function(d){ var o=d.data()||{}; o.id=d.id; return o; }); renderList(); }, function(err){ console.warn(err); });

    /* ── Применяем тексты ── */
    document.getElementById("navhold").style.height = HEADER_HEIGHT;
    document.getElementById("projTitle").textContent = PROJECT_TITLE;
    document.getElementById("projBadge").textContent = PROJECT_BADGE;
    document.getElementById("notesTitle").textContent = NOTES_TITLE;
    document.getElementById("notesText").textContent = NOTES_TEXT;
    document.getElementById("instrTitle").textContent = INSTR_TITLE;
    document.getElementById("welList").innerHTML = WELCOME_STEPS.map(function(s){ return '<li><span class="rv__instr-ico">'+(ICON[s.icon]||"")+'</span><span>'+esc(s.text)+'</span></li>'; }).join("");

    /* ── Старт ── */
    renderAuth(); renderFormState(); setChip(0); updateProgress(0); fitCanvas(); renderList(); updateGate();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
