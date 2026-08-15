"use client";
import { useState } from "react";
const ideas = [
  { icon: "✦", title: "Une newsletter des découvertes de la semaine", meta: "Créativité · il y a 12 min", tone: "sun" },
  { icon: "◌", title: "Organiser un dîner sans téléphone", meta: "Vie perso · hier", tone: "mint" },
  { icon: "↗", title: "Mini-app pour apprendre 5 mots par jour", meta: "Projet · lundi", tone: "lilac" },
];
export default function Home() {
  const [text, setText] = useState(""); const [saved, setSaved] = useState(ideas);
  function capture() { const value=text.trim(); if(!value)return; setSaved([{icon:"✦",title:value,meta:"Nouvelle idée · à l’instant",tone:"sun"},...saved]); setText(""); }
  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span>é</span> étincelle</div><nav>
      <button className="nav active"><span>⌂</span>Aujourd’hui</button><button className="nav"><span>◫</span>Mes idées <b>{saved.length}</b></button><button className="nav"><span>◇</span>Connexions</button><button className="nav"><span>♧</span>Mon jardin</button>
    </nav><div className="sidebarFoot"><div className="streak"><span>7</span><div><strong>7 jours d’élan</strong><small>Continue comme ça</small></div></div><button className="profile"><span>KL</span><div><strong>Karim</strong><small>Mon espace</small></div><i>•••</i></button></div></aside>
    <section className="content"><header><p>Dimanche 16 août</p><button aria-label="Notifications">○</button></header>
      <div className="hero"><span className="eyebrow">BONJOUR KARIM</span><h1>Qu’est-ce qui te traverse<br/>l’esprit aujourd’hui ?</h1><p>Dépose une pensée, même imparfaite. Tu pourras la faire grandir plus tard.</p>
        <div className="capture"><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))capture()}} placeholder="Écris ton idée ici…" aria-label="Nouvelle idée"/><div><button className="tool" aria-label="Note vocale">⌁</button><button className="tool" aria-label="Ajouter une image">▧</button><button className="save" onClick={capture}>Capturer <span>↗</span></button></div></div>
        <div className="hint"><span>✦</span> Pas d’inspiration ? <button onClick={()=>setText("Et si je pouvais…")}>Lance-moi une piste</button></div>
      </div><section className="recent"><div className="sectionTitle"><div><span>TES DERNIÈRES ÉTINCELLES</span><h2>Idées récentes</h2></div><button>Tout voir →</button></div><div className="ideaGrid">{saved.slice(0,3).map((idea,index)=><article className="ideaCard" key={`${idea.title}-${index}`}><div className={`ideaIcon ${idea.tone}`}>{idea.icon}</div><button className="more">•••</button><h3>{idea.title}</h3><p>{idea.meta}</p><div className="cardBottom"><span>{index===0?"À explorer":index===1?"Capturée":"Prometteuse"}</span><button aria-label="Ouvrir">↗</button></div></article>)}</div></section>
    </section></main>;
}
