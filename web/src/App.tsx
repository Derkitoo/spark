"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Idea = {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  createdAt: string | number;
  updatedAt: string | number;
  problem?: string;
  audience?: string;
  potential?: string;
  nextAction?: string;
  tags?: string[];
  pinned?: boolean;
};

const categories = ["Personnel", "Projet", "Créativité", "Travail", "À partager"];
const statuses = ["Capturée", "À explorer", "Prometteuse", "En projet", "Réalisée"];

export default function Home() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [text, setText] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [view, setView] = useState<"today" | "library" | "connections" | "garden" | "mindmap">("today");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [maturing, setMaturing] = useState<Idea | null>(null);
  const [aiIdea, setAiIdea] = useState<Idea | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function syncToSupabase(ideasToSync: Idea[], userId: string) {
    if (!ideasToSync.length) return true;
    const fullRows = ideasToSync.map(i => toRow(i, userId));
    const { error: fullErr } = await supabase.from("ideas").upsert(fullRows);
    if (fullErr) {
      // Fallback: try core rows without tags/pinned if DB schema is pending migration
      const coreRows = ideasToSync.map(i => toRowCore(i, userId));
      const { error: coreErr } = await supabase.from("ideas").upsert(coreRows);
      if (coreErr) {
        console.error("Supabase sync error:", coreErr.message);
        return false;
      }
    }
    return true;
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      setSyncing(true);
      try {
        const saved = localStorage.getItem("etincelle-ideas-v1");
        const local: Idea[] = saved ? JSON.parse(saved) : [];
        if (local.length) {
          await syncToSupabase(local, user.id);
        }
        const { data, error: loadError } = await supabase.from("ideas").select("*").order("updated_at", { ascending: false });
        if (loadError) throw loadError;
        const synced = (data ?? []).map(fromRow);
        if (active) {
          setIdeas(synced);
          localStorage.setItem("etincelle-ideas-v1", JSON.stringify(synced));
        }
      } catch (err) {
        console.warn("Sync notice:", err);
        if (active) setError("La synchronisation a rencontré un problème.");
      } finally {
        if (active) {
          setLoading(false);
          setSyncing(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  function persist(next: Idea[]) {
    setIdeas(next);
    localStorage.setItem("etincelle-ideas-v1", JSON.stringify(next));
    if (user && next.length) {
      setSyncing(true);
      void syncToSupabase(next, user.id).then(ok => {
        if (!ok) setError("La synchronisation a rencontré un problème.");
        setSyncing(false);
      });
    }
  }

  function parseTagsStr(raw: string): string[] {
    return Array.from(
      new Set(
        raw
          .split(/[\s,]+/)
          .map(t => t.trim().replace(/^#/, ""))
          .filter(t => t.length > 0)
      )
    );
  }

  function capture() {
    const title = text.trim();
    if (!title) return;
    setSaving(true);
    setError("");
    const now = Date.now();
    const tags = parseTagsStr(tagInput);
    const idea: Idea = {
      id: crypto.randomUUID(),
      title,
      content: "",
      category: "Personnel",
      status: "Capturée",
      tags,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    persist([idea, ...ideas]);
    setText("");
    setTagInput("");
    setSaving(false);
  }

  function togglePin(idea: Idea, e?: React.MouseEvent) {
    e?.stopPropagation();
    const next = ideas.map(i => (i.id === idea.id ? { ...i, pinned: !i.pinned, updatedAt: Date.now() } : i));
    persist(next);
    if (editing?.id === idea.id) {
      setEditing({ ...editing, pinned: !editing.pinned });
    }
  }

  function update(form: FormData) {
    if (!editing) return;
    setSaving(true);
    const tagsRaw = String(form.get("tags") ?? "");
    const tags = parseTagsStr(tagsRaw);
    const next: Idea = {
      ...editing,
      title: String(form.get("title")).trim(),
      content: String(form.get("content")).trim(),
      category: String(form.get("category")),
      status: String(form.get("status")),
      tags,
      updatedAt: Date.now(),
    };
    persist(ideas.map(i => (i.id === editing.id ? next : i)));
    setEditing(null);
    setSaving(false);
  }

  function mature(form: FormData) {
    if (!maturing) return;
    const next: Idea = {
      ...maturing,
      problem: String(form.get("problem")).trim(),
      audience: String(form.get("audience")).trim(),
      potential: String(form.get("potential")).trim(),
      nextAction: String(form.get("nextAction")).trim(),
      status: maturing.status === "Capturée" ? "À explorer" : maturing.status,
      updatedAt: Date.now(),
    };
    persist(ideas.map(i => (i.id === maturing.id ? next : i)));
    setMaturing(null);
  }

  function remove() {
    if (!editing || !confirm("Supprimer cette idée ?")) return;
    const id = editing.id;
    setIdeas(ideas.filter(i => i.id !== id));
    localStorage.setItem("etincelle-ideas-v1", JSON.stringify(ideas.filter(i => i.id !== id)));
    if (user) void supabase.from("ideas").delete().eq("id", id);
    setEditing(null);
  }

  function advance(idea: Idea) {
    const index = statuses.indexOf(idea.status);
    if (index < 0 || index === statuses.length - 1) return;
    persist(ideas.map(i => (i.id === idea.id ? { ...i, status: statuses[index + 1], updatedAt: Date.now() } : i)));
  }

  const allTags = Array.from(new Set(ideas.flatMap(i => i.tags ?? []))).sort();

  const filtered = ideas
    .filter(i => {
      const matchQuery = `${i.title} ${i.content} ${i.category} ${i.status} ${(i.tags ?? []).map(t => "#" + t).join(" ")}`
        .toLocaleLowerCase("fr")
        .includes(query.trim().toLocaleLowerCase("fr"));
      const matchTag = !selectedTag || (i.tags && i.tags.includes(selectedTag));
      return matchQuery && matchTag;
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || Number(b.updatedAt) - Number(a.updatedAt));

  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  if (authLoading) return <div className="authLoading"><span>S</span><p>Ouverture de Spark…</p></div>;
  if (!user) return <AuthScreen />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>S</span> Spark</div>
        <nav>
          <button onClick={() => setView("today")} className={`nav ${view === "today" ? "active" : ""}`}>
            <span>⌂</span>Aujourd’hui
          </button>
          <button onClick={() => setView("library")} className={`nav ${view === "library" ? "active" : ""}`}>
            <span>▤</span>Mes idées <b>{ideas.length}</b>
          </button>
          <button onClick={() => setView("mindmap")} className={`nav ${view === "mindmap" ? "active" : ""}`}>
            <span>☸</span>Mindmap
          </button>
          <button onClick={() => setView("connections")} className={`nav ${view === "connections" ? "active" : ""}`}>
            <span>◇</span>Connexions
          </button>
          <button onClick={() => setView("garden")} className={`nav ${view === "garden" ? "active" : ""}`}>
            <span>♧</span>Mon jardin
          </button>
        </nav>
        <div className="sidebarFoot">
          <div className="streak">
            <span>✦</span>
            <div>
              <strong>{ideas.length} étincelle{ideas.length !== 1 ? "s" : ""}</strong>
              <small>Ton jardin prend vie</small>
            </div>
          </div>
          <div className="privacy">● Synchronisation active</div>
          <button className="account" onClick={() => supabase.auth.signOut()}>
            <span>{(user.user_metadata?.full_name ?? user.email ?? "S").slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user.user_metadata?.full_name ?? "Mon compte"}</strong>
              <small>{user.email}</small>
            </div>
            <i>Déconnexion</i>
          </button>
        </div>
      </aside>

      <section className="content">
        <header>
          <p>{date}</p>
          <span className="cloud">{syncing ? "↻ Synchronisation…" : "✓ Synchronisé"}</span>
        </header>

        {error && (
          <div className="error">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        {view === "today" ? (
          <>
            <div className="hero">
              <span className="eyebrow">TON ESPACE DE PENSÉE</span>
              <h1>Qu’est-ce qui te traverse<br />l’esprit aujourd’hui ?</h1>
              <p>Dépose une pensée, même imparfaite. Tu pourras la faire grandir plus tard.</p>

              <div className="capture">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) capture();
                  }}
                  placeholder="Écris ton idée ici…"
                  aria-label="Nouvelle idée"
                />
                <div className="tagRow">
                  <span className="tagIcon">#</span>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    placeholder="Tags (ex: projet, design, v1)..."
                    className="tagField"
                  />
                </div>
                <div className="captureBottom">
                  <span className="shortcut">Ctrl + Entrée</span>
                  <button className="save" disabled={saving || !text.trim()} onClick={capture}>
                    {saving ? "Enregistrement…" : "Capturer"} <span>↗</span>
                  </button>
                </div>
              </div>

              <div className="hint">
                <span>✦</span> Pas d’inspiration ?{" "}
                <button onClick={() => setText("Et si je pouvais…")}>Lance-moi une piste</button>
              </div>
            </div>

            <IdeaSection
              ideas={ideas.slice(0, 3)}
              loading={loading}
              onOpen={setEditing}
              onTogglePin={togglePin}
              title="Idées récentes"
              onAll={() => setView("library")}
              onTagClick={tag => {
                setSelectedTag(tag);
                setView("library");
              }}
            />
          </>
        ) : view === "library" ? (
          <section className="library">
            <span className="eyebrow">TA MÉMOIRE CRÉATIVE</span>
            <div className="libraryHead">
              <div>
                <h1>Toutes mes idées</h1>
                <p>Retrouve, affine et transforme tes pensées.</p>
              </div>
              <button className="newIdea" onClick={() => setView("today")}>+ Nouvelle idée</button>
            </div>

            <div className="search">
              <span>⌕</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher dans mes idées ou par #tag..."
              />
              {query && <button className="clearSearch" onClick={() => setQuery("")}>×</button>}
            </div>

            {allTags.length > 0 && (
              <div className="filterPills">
                <button
                  className={`filterPill ${selectedTag === null ? "active" : ""}`}
                  onClick={() => setSelectedTag(null)}
                >
                  Toutes ({ideas.length})
                </button>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    className={`filterPill ${selectedTag === tag ? "active" : ""}`}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            <IdeaSection
              ideas={filtered}
              loading={loading}
              onOpen={setEditing}
              onTogglePin={togglePin}
              title=""
              onTagClick={tag => setSelectedTag(selectedTag === tag ? null : tag)}
            />
          </section>
        ) : view === "connections" ? (
          <Connections ideas={ideas} onOpen={setEditing} onCreate={() => setView("today")} />
        ) : view === "mindmap" ? (
          <MindmapView
            ideas={ideas}
            onOpen={setEditing}
            onCreate={title => {
              if (title) setText(title);
              setView("today");
            }}
            categories={categories}
          />
        ) : (
          <Garden ideas={ideas} onOpen={setEditing} onAdvance={advance} onCreate={() => setView("today")} />
        )}
      </section>

      {editing && (
        <div className="modalBack" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <form className="modal" action={update}>
            <div className="modalTop">
              <span className="eyebrow">FICHE DE L’IDÉE</span>
              <div className="modalTopActions">
                <button
                  type="button"
                  className={`pinModalBtn ${editing.pinned ? "active" : ""}`}
                  onClick={e => togglePin(editing, e)}
                  title={editing.pinned ? "Désépingler" : "Épingler en haut"}
                >
                  {editing.pinned ? "★ Épinglée" : "☆ Épingler"}
                </button>
                <button type="button" className="closeModal" onClick={() => setEditing(null)}>×</button>
              </div>
            </div>

            <input className="titleInput" name="title" defaultValue={editing.title} required />
            <textarea
              className="contentInput"
              name="content"
              defaultValue={editing.content}
              placeholder="Ajoute du contexte, des pistes, une prochaine étape…"
            />

            <div className="fields">
              <label>
                Catégorie
                <select name="category" defaultValue={editing.category}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>
                État
                <select name="status" defaultValue={editing.status}>
                  {statuses.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <div className="tagEditSection">
              <label className="tagLabel">Tags (séparés par des virgules ou espaces)</label>
              <input
                type="text"
                name="tags"
                defaultValue={(editing.tags ?? []).join(", ")}
                placeholder="ex: projet, urgent, v1"
                className="tagInput"
              />
            </div>

            {editing.nextAction && (
              <div className="nextPreview">
                <span>PROCHAINE ACTION</span>
                <p>{editing.nextAction}</p>
              </div>
            )}

            <div className="modalActions">
              <button type="button" className="delete" onClick={remove}>Supprimer</button>
              <button
                type="button"
                className="aiSparkBtn"
                onClick={() => {
                  setAiIdea(editing);
                }}
              >
                ✦ Étincelle IA
              </button>
              <button
                type="button"
                className="matureBtn"
                onClick={() => {
                  setMaturing(editing);
                  setEditing(null);
                }}
              >
                ✦ Faire mûrir
              </button>
              <button className="save" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </div>
      )}

      {maturing && <MatureFlow idea={maturing} onClose={() => setMaturing(null)} onSave={mature} />}

      {aiIdea && (
        <SparkAIAssistant
          idea={aiIdea}
          onClose={() => setAiIdea(null)}
          onApplyAction={actionStr => {
            const next = ideas.map(i => (i.id === aiIdea.id ? { ...i, nextAction: actionStr, updatedAt: Date.now() } : i));
            persist(next);
            if (editing?.id === aiIdea.id) {
              setEditing({ ...editing, nextAction: actionStr });
            }
          }}
          onApplyTags={newTags => {
            const combined = Array.from(new Set([...(aiIdea.tags ?? []), ...newTags]));
            const next = ideas.map(i => (i.id === aiIdea.id ? { ...i, tags: combined, updatedAt: Date.now() } : i));
            persist(next);
            if (editing?.id === aiIdea.id) {
              setEditing({ ...editing, tags: combined });
            }
          }}
        />
      )}
    </main>
  );
}

function toRow(idea: Idea, userId: string) {
  return {
    id: idea.id,
    user_id: userId,
    title: idea.title,
    content: idea.content,
    category: idea.category,
    status: idea.status,
    problem: idea.problem ?? "",
    audience: idea.audience ?? "",
    potential: idea.potential ?? "",
    next_action: idea.nextAction ?? "",
    tags: idea.tags ?? [],
    pinned: idea.pinned ?? false,
    created_at: new Date(idea.createdAt).toISOString(),
    updated_at: new Date(idea.updatedAt).toISOString(),
  };
}

function toRowCore(idea: Idea, userId: string) {
  return {
    id: idea.id,
    user_id: userId,
    title: idea.title,
    content: idea.content,
    category: idea.category,
    status: idea.status,
    problem: idea.problem ?? "",
    audience: idea.audience ?? "",
    potential: idea.potential ?? "",
    next_action: idea.nextAction ?? "",
    created_at: new Date(idea.createdAt).toISOString(),
    updated_at: new Date(idea.updatedAt).toISOString(),
  };
}

function fromRow(row: Record<string, unknown>): Idea {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content ?? ""),
    category: String(row.category ?? "Personnel"),
    status: String(row.status ?? "Capturée"),
    problem: String(row.problem ?? ""),
    audience: String(row.audience ?? ""),
    potential: String(row.potential ?? ""),
    nextAction: String(row.next_action ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    pinned: Boolean(row.pinned ?? false),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function AuthScreen() {
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  async function login() {
    setBusy(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://derkitoo.github.io/spark/" },
    });
    if (error) {
      setAuthError("La connexion Google n’a pas pu démarrer.");
      setBusy(false);
    }
  }

  return (
    <main className="authPage">
      <section className="authBrand">
        <div className="brand"><span>S</span> Spark</div>
        <div>
          <span className="eyebrow">CAPTURE THE SPARK. GROW THE IDEA.</span>
          <h1>Un espace calme pour les idées qui comptent.</h1>
          <p>Capture une pensée, relie-la aux autres et transforme-la en prochaine action.</p>
        </div>
        <div className="authQuote">“Les grandes idées commencent souvent par une note minuscule.”</div>
      </section>
      <section className="authCard">
        <div>
          <span className="authMark">S</span>
          <h2>Bienvenue dans Spark</h2>
          <p>Connecte-toi pour retrouver tes idées sur tous tes appareils.</p>
          <button onClick={login} disabled={busy}>
            <b>G</b>{busy ? "Connexion…" : "Continuer avec Google"}
          </button>
          {authError && <small className="authError">{authError}</small>}
          <small>En continuant, tes idées restent privées et liées uniquement à ton compte.</small>
        </div>
      </section>
    </main>
  );
}

function IdeaSection({
  ideas,
  loading,
  onOpen,
  onTogglePin,
  title,
  onAll,
  onTagClick,
}: {
  ideas: Idea[];
  loading: boolean;
  onOpen: (i: Idea) => void;
  onTogglePin?: (i: Idea, e: React.MouseEvent) => void;
  title: string;
  onAll?: () => void;
  onTagClick?: (tag: string) => void;
}) {
  return (
    <section className="recent">
      <div className="sectionTitle">
        <div>
          {title && (
            <>
              <span>TES DERNIÈRES ÉTINCELLES</span>
              <h2>{title}</h2>
            </>
          )}
        </div>
        {onAll && <button onClick={onAll}>Tout voir →</button>}
      </div>

      {loading ? (
        <div className="empty">Chargement de tes idées…</div>
      ) : ideas.length === 0 ? (
        <div className="empty">
          <strong>Ta prochaine étincelle commence ici.</strong>
          <span>Capture une idée pour la retrouver dans cette bibliothèque.</span>
        </div>
      ) : (
        <div className="ideaGrid">
          {ideas.map((idea, index) => (
            <article
              className={`ideaCard ${idea.pinned ? "pinned" : ""}`}
              key={idea.id}
              onClick={() => onOpen(idea)}
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter") onOpen(idea); }}
            >
              <div className="cardHeaderRow">
                <div className={`ideaIcon ${["sun", "mint", "lilac"][index % 3]}`}>✦</div>
                <button
                  className={`pinBadgeBtn ${idea.pinned ? "active" : ""}`}
                  onClick={e => onTogglePin?.(idea, e)}
                  title={idea.pinned ? "Épinglée (clique pour désépingler)" : "Épingler l'idée"}
                >
                  {idea.pinned ? "★" : "☆"}
                </button>
              </div>

              <span className="category">{idea.category}</span>
              <h3>{idea.title}</h3>

              {idea.tags && idea.tags.length > 0 && (
                <div className="cardTags">
                  {idea.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="cardTagPill"
                      onClick={e => {
                        e.stopPropagation();
                        onTagClick?.(tag);
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                  {idea.tags.length > 3 && <span className="cardTagMore">+{idea.tags.length - 3}</span>}
                </div>
              )}

              <p>{new Date(idea.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>

              <div className="cardBottom">
                <span>{idea.status}</span>
                <button aria-label="Ouvrir">↗</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Assistant IA & Suggestions créatives (Mode Autonome + Mode Clé API) */
function SparkAIAssistant({
  idea,
  onClose,
  onApplyAction,
  onApplyTags,
}: {
  idea: Idea;
  onClose: () => void;
  onApplyAction: (action: string) => void;
  onApplyTags: (tags: string[]) => void;
}) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("spark_ai_api_key") || "");
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const [tagsDone, setTagsDone] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<{
    boostQuestions: string[];
    suggestedAction: string;
    suggestedTags: string[];
    summary: string;
  } | null>(null);

  useEffect(() => {
    generateSuggestions();
  }, [idea]);

  async function generateSuggestions() {
    setLoading(true);
    setActionDone(false);
    setTagsDone(false);

    // If an API key is stored, try LLM API call first
    if (apiKey.trim()) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "Tu es l'assistant créatif de Spark (Étincelle). Réponds en JSON strict avec les clés: boostQuestions (tableau de 2 questions de relance), suggestedAction (1 action concrète de 20 min), suggestedTags (tableau de 3-4 tags pertinents sans le symbole #), summary (1 phrase d'encouragement).",
              },
              {
                role: "user",
                content: `Titre: ${idea.title}\nContenu: ${idea.content}\nCatégorie: ${idea.category}`,
              },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data.choices[0].message.content);
          setSuggestions({
            boostQuestions: parsed.boostQuestions || [],
            suggestedAction: parsed.suggestedAction || "",
            suggestedTags: parsed.suggestedTags || [],
            summary: parsed.summary || "",
          });
          setLoading(false);
          return;
        }
      } catch {
        // Fallback to native local generator
      }
    }

    // Native Smart Generator (Offline fallback)
    setTimeout(() => {
      const localSuggestions = generateLocalSuggestions(idea);
      setSuggestions(localSuggestions);
      setLoading(false);
    }, 400);
  }

  function saveApiKey(val: string) {
    setApiKey(val);
    if (val.trim()) {
      localStorage.setItem("spark_ai_api_key", val.trim());
    } else {
      localStorage.removeItem("spark_ai_api_key");
    }
  }

  return (
    <div className="aiModalBack" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="aiModal">
        <div className="aiHeader">
          <div className="aiTitleRow">
            <span className="aiIcon">✦</span>
            <div>
              <span className="eyebrow">ASSISTANT ÉTINCELLE IA</span>
              <h2>{idea.title}</h2>
            </div>
          </div>
          <div className="aiHeaderActions">
            <button
              className="aiConfigBtn"
              onClick={() => setShowSettings(!showSettings)}
              title="Configurer une clé API LLM"
            >
              ⚙ {apiKey ? "Clé API active" : "Mode local"}
            </button>
            <button className="closeModal" onClick={onClose}>×</button>
          </div>
        </div>

        {showSettings && (
          <div className="aiSettingsPanel">
            <h4>Configuration Clé API (Optionnel)</h4>
            <p>Saisis ta clé OpenAI (ou laisse vide pour utiliser l'IA native hors-ligne intégrée) :</p>
            <input
              type="password"
              value={apiKey}
              onChange={e => saveApiKey(e.target.value)}
              placeholder="sk-..."
              className="apiKeyInput"
            />
            <small>La clé est stockée uniquement sur cet appareil.</small>
          </div>
        )}

        <div className="aiBody">
          {loading ? (
            <div className="aiLoading">
              <span className="sparkleSpinner">✦</span>
              <p>L'étincelle IA formule des pistes pour ta pensée…</p>
            </div>
          ) : suggestions ? (
            <div className="aiContent">
              <div className="aiCard">
                <span className="aiCardTag">⚡ RELANCER LA RÉFLEXION</span>
                <ul className="aiQuestionsList">
                  {suggestions.boostQuestions.map((q, idx) => (
                    <li key={idx}>“{q}”</li>
                  ))}
                </ul>
              </div>

              {suggestions.suggestedAction && (
                <div className="aiCard">
                  <span className="aiCardTag">🎯 PROCHAINE ACTION CONCRÈTE (20 MIN)</span>
                  <p className="aiActionText">{suggestions.suggestedAction}</p>
                  <button
                    className={`aiApplyBtn ${actionDone ? "done" : ""}`}
                    disabled={actionDone}
                    onClick={() => {
                      onApplyAction(suggestions.suggestedAction);
                      setActionDone(true);
                    }}
                  >
                    {actionDone ? "✓ Action ajoutée à l'idée" : "+ Ajouter à la fiche de l'idée"}
                  </button>
                </div>
              )}

              {suggestions.suggestedTags.length > 0 && (
                <div className="aiCard">
                  <span className="aiCardTag">🏷️ TAGS RECOMMANDÉS</span>
                  <div className="aiTagsRow">
                    {suggestions.suggestedTags.map(t => (
                      <span key={t} className="aiTagPill">#{t}</span>
                    ))}
                  </div>
                  <button
                    className={`aiApplyBtn ${tagsDone ? "done" : ""}`}
                    disabled={tagsDone}
                    onClick={() => {
                      onApplyTags(suggestions.suggestedTags);
                      setTagsDone(true);
                    }}
                  >
                    {tagsDone ? "✓ Tags ajoutés" : "+ Appliquer ces tags"}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="aiFooter">
          <button className="aiRegenerate" onClick={generateSuggestions} disabled={loading}>
            ↻ Relancer une nouvelle analyse
          </button>
        </div>
      </div>
    </div>
  );
}

function generateLocalSuggestions(idea: Idea) {
  const words = `${idea.title} ${idea.content}`.toLowerCase();

  // Smart heuristic rules based on keywords & category
  const isTech = words.includes("app") || words.includes("site") || words.includes("code") || words.includes("dev") || idea.category === "Projet";
  const isCreative = words.includes("dessin") || words.includes("livre") || words.includes("ecrire") || words.includes("art") || idea.category === "Créativité";
  const isWork = idea.category === "Travail" || words.includes("reunion") || words.includes("client");

  let questions = [
    `Et si tu simplifiais l'idée « ${idea.title} » à son essence minimale ?`,
    "Quel est le premier obstacle qui pourrait freiner la réalisation ?",
  ];

  let action = `Rédiger 3 lignes définissant la proposition de valeur de « ${idea.title} ».`;
  let tags = ["concept", "reflexion"];

  if (isTech) {
    questions = [
      `Quelle est la seule fonctionnalité sans laquelle « ${idea.title} » n'a aucun sens ?`,
      "À qui proposerais-tu de tester la toute première démo ?",
    ];
    action = `Créer une maquette rapide ou lister la pile technique nécessaire pour « ${idea.title} ».`;
    tags = ["projet", "tech", "v1"];
  } else if (isCreative) {
    questions = [
      `Quelle émotion souhaites-tu susciter avec « ${idea.title} » ?`,
      "Existe-t-il une référence ou une œuvre inspirante similaire ?",
    ];
    action = `Consacrer 15 minutes à un premier croquis ou prototype brut.`;
    tags = ["creativite", "inspiration", "art"];
  } else if (isWork) {
    questions = [
      `Quel impact mesurable « ${idea.title} » aura-t-il sur ton organisation ?`,
      "Qui a besoin d'être validé ou impliqué dès le départ ?",
    ];
    action = `Envoyer un message à une personne clé pour partager l'idée.`;
    tags = ["travail", "strategie", "action"];
  }

  // Add category tag
  tags.push(idea.category.toLowerCase());

  return {
    boostQuestions: questions,
    suggestedAction: action,
    suggestedTags: Array.from(new Set(tags)),
    summary: "Une bonne idée gagne toujours à être découpée en un petit pas immédiat.",
  };
}

const prompts = [
  { key: "problem", label: "Le déclic", question: "Quel problème ou désir se cache derrière cette idée ?", hint: "Décris la situation que tu aimerais améliorer…" },
  { key: "audience", label: "Les personnes", question: "À qui cette idée serait-elle vraiment utile ?", hint: "Une personne précise, un groupe, toi-même…" },
  { key: "potential", label: "La valeur", question: "Qu’est-ce qui rend cette idée intéressante ou différente ?", hint: "Son bénéfice, sa singularité, ce qu’elle change…" },
  { key: "nextAction", label: "Le premier pas", question: "Quelle action peux-tu réaliser en moins de 30 minutes ?", hint: "Un message, une recherche, un croquis, un test…" },
] as const;

function MatureFlow({ idea, onClose, onSave }: { idea: Idea; onClose: () => void; onSave: (form: FormData) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({
    problem: idea.problem ?? "",
    audience: idea.audience ?? "",
    potential: idea.potential ?? "",
    nextAction: idea.nextAction ?? "",
  });
  const current = prompts[step];

  function finish() {
    const form = new FormData();
    prompts.forEach(p => form.set(p.key, answers[p.key] ?? ""));
    onSave(form);
  }

  return (
    <div className="matureBack">
      <section className="matureFlow">
        <div className="matureNav">
          <div className="brand mini"><span>S</span> Spark</div>
          <button onClick={onClose}>Quitter ×</button>
        </div>
        <div className="matureProgress">
          <span style={{ width: `${((step + 1) / prompts.length) * 100}%` }} />
        </div>
        <div className="matureBody">
          <aside>
            <span className="eyebrow">FAIRE MÛRIR</span>
            <h2>{idea.title}</h2>
            <div className="stepList">
              {prompts.map((p, i) => (
                <button key={p.key} className={i === step ? "current" : i < step ? "done" : ""} onClick={() => setStep(i)}>
                  <span>{i < step ? "✓" : i + 1}</span>{p.label}
                </button>
              ))}
            </div>
          </aside>
          <div className="question">
            <span className="questionCount">QUESTION {step + 1} SUR {prompts.length}</span>
            <h1>{current.question}</h1>
            <p>Ne cherche pas la réponse parfaite. Écris simplement ce qui te vient.</p>
            <textarea
              autoFocus
              value={answers[current.key]}
              onChange={e => setAnswers({ ...answers, [current.key]: e.target.value })}
              placeholder={current.hint}
            />
            <div className="questionActions">
              <button disabled={step === 0} onClick={() => setStep(step - 1)}>← Précédent</button>
              {step < prompts.length - 1 ? (
                <button className="continue" onClick={() => setStep(step + 1)}>Continuer →</button>
              ) : (
                <button className="continue finish" onClick={finish}>Terminer et enregistrer ✦</button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function words(idea: Idea) {
  const ignored = new Set(["avec", "pour", "dans", "une", "des", "les", "mon", "mes", "sur", "faire", "plus", "idée", "qui", "que", "est"]);
  return new Set(`${idea.title} ${idea.content}`.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(w => w.length > 2 && !ignored.has(w)));
}

function Connections({ ideas, onOpen, onCreate }: { ideas: Idea[]; onOpen: (i: Idea) => void; onCreate: () => void }) {
  const themes = Object.entries(ideas.reduce<Record<string, Idea[]>>((a, i) => { (a[i.category] ??= []).push(i); return a; }, {})).sort((a, b) => b[1].length - a[1].length);
  const pairs: { a: Idea; b: Idea; score: number; common: string[] }[] = [];

  for (let i = 0; i < ideas.length; i++) {
    for (let j = i + 1; j < ideas.length; j++) {
      const wa = words(ideas[i]), wb = words(ideas[j]);
      const common = [...wa].filter(w => wb.has(w));
      const score = common.length + (ideas[i].category === ideas[j].category ? 1 : 0);
      if (score > 0) pairs.push({ a: ideas[i], b: ideas[j], score, common });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  return (
    <section className="connections">
      <span className="eyebrow">RELIE LES POINTS</span>
      <div className="connectionsHead">
        <div>
          <h1>Connexions</h1>
          <p>Spark repère les fils invisibles entre tes pensées.</p>
        </div>
        <div className="connectionStat">
          <strong>{pairs.length}</strong>
          <span>liens détectés</span>
        </div>
      </div>

      {ideas.length < 2 ? (
        <div className="connectionEmpty">
          <div className="orbit">✦</div>
          <h2>Les connexions apparaîtront bientôt</h2>
          <p>Ajoute au moins deux idées. Plus tu nourris Spark, plus les rapprochements deviennent intéressants.</p>
          <button className="newIdea" onClick={onCreate}>Capturer une idée</button>
        </div>
      ) : (
        <>
          <div className="themeRow">
            {themes.slice(0, 4).map(([name, list], i) => (
              <div className={`themePill theme${i}`} key={name}>
                <span>{["✦", "◌", "◇", "↗"][i]}</span>
                <div>
                  <strong>{name}</strong>
                  <small>{list.length} idée{list.length > 1 ? "s" : ""}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="connectionLayout">
            <div>
              <h2>Rapprochements prometteurs</h2>
              <div className="pairList">
                {pairs.length ? (
                  pairs.slice(0, 5).map((pair, i) => (
                    <article className="pair" key={`${pair.a.id}-${pair.b.id}`}>
                      <div className="pairNum">0{i + 1}</div>
                      <div className="pairIdeas">
                        <button onClick={() => onOpen(pair.a)}>{pair.a.title}</button>
                        <span>＋</span>
                        <button onClick={() => onOpen(pair.b)}>{pair.b.title}</button>
                      </div>
                      <div className="why">
                        {pair.common.length ? `Mots en commun : ${pair.common.slice(0, 3).join(", ")}` : `Même univers : ${pair.a.category}`}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="noPair">Varie les descriptions de tes idées pour révéler davantage de liens.</div>
                )}
              </div>
            </div>

            <aside className="insight">
              <span className="insightIcon">✦</span>
              <span className="eyebrow">PISTE À EXPLORER</span>
              <h3>{pairs[0] ? `Et si « ${pairs[0].a.title} » rencontrait « ${pairs[0].b.title} » ?` : "Deux idées peuvent devenir une nouvelle direction."}</h3>
              <p>Prends cinq minutes pour imaginer une version qui combine le meilleur des deux.</p>
              {pairs[0] && <button onClick={() => onOpen(pairs[0].a)}>Commencer à explorer →</button>}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function Garden({ ideas, onOpen, onAdvance, onCreate }: { ideas: Idea[]; onOpen: (i: Idea) => void; onAdvance: (i: Idea) => void; onCreate: () => void }) {
  const grouped = statuses.map(status => ({ status, ideas: ideas.filter(i => i.status === status) }));
  const completed = ideas.filter(i => i.status === "Réalisée").length;
  const progress = ideas.length ? Math.round(ideas.reduce((sum, i) => sum + Math.max(0, statuses.indexOf(i.status)), 0) / (ideas.length * (statuses.length - 1)) * 100) : 0;
  const focus = ideas.filter(i => i.status !== "Réalisée").sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt))[0];

  return (
    <section className="garden">
      <span className="eyebrow">FAIS GRANDIR TES IDÉES</span>
      <div className="gardenHead">
        <div>
          <h1>Mon jardin</h1>
          <p>Chaque idée avance à son rythme. Un petit geste suffit pour la faire pousser.</p>
        </div>
        <button className="newIdea" onClick={onCreate}>+ Planter une idée</button>
      </div>

      <div className="gardenStats">
        <div><span>✦</span><strong>{ideas.length}</strong><small>idées plantées</small></div>
        <div><span>↗</span><strong>{progress}%</strong><small>de maturité</small></div>
        <div><span>❀</span><strong>{completed}</strong><small>idée{completed !== 1 ? "s" : ""} réalisée{completed !== 1 ? "s" : ""}</small></div>
      </div>

      {ideas.length === 0 ? (
        <div className="gardenEmpty">
          <div className="soil"><span>✦</span></div>
          <h2>Ton jardin attend sa première graine</h2>
          <p>Capture une pensée, même minuscule. C’est ainsi que commencent les beaux projets.</p>
          <button className="newIdea" onClick={onCreate}>Planter ma première idée</button>
        </div>
      ) : (
        <>
          <div className="gardenFocus">
            <div>
              <span className="eyebrow">À ARROSER AUJOURD’HUI</span>
              <h2>{focus?.title ?? "Toutes tes idées ont fleuri !"}</h2>
              <p>{focus?.content || "Ajoute un peu de contexte ou fais-la passer à l’étape suivante."}</p>
            </div>
            {focus && (
              <div className="focusActions">
                <button onClick={() => onOpen(focus)}>Ouvrir</button>
                <button className="grow" onClick={() => onAdvance(focus)}>Faire grandir →</button>
              </div>
            )}
          </div>

          <div className="growthPath">
            {grouped.map((group, index) => (
              <section className="growthStage" key={group.status}>
                <div className="stageTop">
                  <div className={`stageIcon stage${index}`}>{["•", "⌁", "♧", "✦", "❀"][index]}</div>
                  <div><span>ÉTAPE {index + 1}</span><h3>{group.status}</h3></div>
                  <b>{group.ideas.length}</b>
                </div>
                <div className="stageIdeas">
                  {group.ideas.length ? (
                    group.ideas.map(idea => (
                      <article key={idea.id}>
                        <button className="stageTitle" onClick={() => onOpen(idea)}>{idea.title}</button>
                        <small>{idea.category}</small>
                        {index < statuses.length - 1 && (
                          <button className="stageAdvance" onClick={() => onAdvance(idea)} aria-label="Faire avancer">→</button>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="stageBlank">Aucune idée</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type AiNode = {
  id: string;
  label: string;
  category: "action" | "angle" | "risk" | "audience";
};

function MindmapView({
  ideas,
  onOpen,
  onCreate,
  categories,
}: {
  ideas: Idea[];
  onOpen: (i: Idea) => void;
  onCreate: (title?: string) => void;
  categories: string[];
}) {
  const [mode, setMode] = useState<"constellation" | "tree">("constellation");
  const [selectedTreeId, setSelectedTreeId] = useState<string>(ideas[0]?.id ?? "");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanDragging, setIsPanDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [aiSubNodes, setAiSubNodes] = useState<Record<string, AiNode[]>>({});
  const [germinating, setGerminating] = useState(false);

  useEffect(() => {
    if (!selectedTreeId && ideas.length > 0) {
      setSelectedTreeId(ideas[0].id);
    }
  }, [ideas, selectedTreeId]);

  const selectedIdea = ideas.find(i => i.id === selectedTreeId) ?? ideas[0];

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => Math.min(Math.max(z * factor, 0.4), 2.5));
  };

  function germinate(idea: Idea) {
    setGerminating(true);
    setTimeout(() => {
      const existing = aiSubNodes[idea.id] ?? [];
      const newNodes: AiNode[] = [
        {
          id: crypto.randomUUID(),
          label: `Action : Prototype rapide de « ${idea.title.slice(0, 20)} »`,
          category: "action",
        },
        {
          id: crypto.randomUUID(),
          label: `Angle : Version orientée ${idea.category === "Personnel" ? "minimaliste" : "communautaire"}`,
          category: "angle",
        },
        {
          id: crypto.randomUUID(),
          label: `Public : Personnes cherchant une solution à ${idea.title.slice(0, 15)}`,
          category: "audience",
        },
      ];
      setAiSubNodes({ ...aiSubNodes, [idea.id]: [...existing, ...newNodes] });
      setGerminating(false);
    }, 600);
  }

  const center = { x: 600, y: 400 };
  const categoryCoords: Record<string, { x: number; y: number }> = {};
  categories.forEach((cat, idx) => {
    const angle = (idx / categories.length) * 2 * Math.PI - Math.PI / 2;
    categoryCoords[cat] = {
      x: center.x + Math.cos(angle) * 240,
      y: center.y + Math.sin(angle) * 220,
    };
  });

  const ideaCoords: Record<string, { x: number; y: number }> = {};
  categories.forEach(cat => {
    const catIdeas = ideas.filter(i => i.category === cat);
    const catCenter = categoryCoords[cat];
    catIdeas.forEach((idea, idx) => {
      const radius = idea.pinned ? 100 : 130 + (idx % 2) * 35;
      const angle = (idx / Math.max(1, catIdeas.length)) * 2 * Math.PI + (idx * 0.4);
      ideaCoords[idea.id] = {
        x: catCenter.x + Math.cos(angle) * radius,
        y: catCenter.y + Math.sin(angle) * radius,
      };
    });
  });

  const tagConnections: { id1: string; id2: string; tag: string }[] = [];
  for (let i = 0; i < ideas.length; i++) {
    for (let j = i + 1; j < ideas.length; j++) {
      const tagsA = ideas[i].tags ?? [];
      const tagsB = ideas[j].tags ?? [];
      const common = tagsA.filter(t => tagsB.includes(t));
      if (common.length > 0) {
        tagConnections.push({ id1: ideas[i].id, id2: ideas[j].id, tag: common[0] });
      }
    }
  }

  return (
    <section className="mindmapSection">
      <span className="eyebrow">CARTOGRAPHIE SPATIALE & PENSÉE VISUELLE</span>
      <div className="mindmapHead">
        <div>
          <h1>Carte Mentale & Constellation</h1>
          <p>Explore et relie visuellement le réseau de tes pensées.</p>
        </div>
        <div className="modeSwitch">
          <button
            className={mode === "constellation" ? "active" : ""}
            onClick={() => setMode("constellation")}
          >
            <span>🌌</span> Constellation Globale
          </button>
          <button
            className={mode === "tree" ? "active" : ""}
            onClick={() => setMode("tree")}
          >
            <span>🌿</span> Arborescence d'Idée
          </button>
        </div>
      </div>

      <div className="canvasWrapper">
        <div className="canvasControls">
          <button onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))} title="Zoom avant">＋</button>
          <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.4))} title="Zoom arrière">－</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Réinitialiser">↺ 100%</button>
          {mode === "tree" && selectedIdea && (
            <button
              className="germinateBtn"
              onClick={() => germinate(selectedIdea)}
              disabled={germinating}
            >
              {germinating ? "✦ Germination en cours…" : "✦ Germer avec l'IA"}
            </button>
          )}
        </div>

        {mode === "tree" && (
          <div className="treeSelector">
            <label>Idée à explorer :</label>
            <select
              value={selectedTreeId}
              onChange={e => setSelectedTreeId(e.target.value)}
            >
              {ideas.map(i => (
                <option key={i.id} value={i.id}>
                  {i.pinned ? "★ " : ""}{i.title} ({i.category})
                </option>
              ))}
            </select>
          </div>
        )}

        {ideas.length === 0 ? (
          <div className="mindmapEmpty">
            <div className="orbit">☸</div>
            <h2>Votre constellation attend vos premières étincelles</h2>
            <p>Ajoutez des idées pour voir s'animer le réseau interactif.</p>
            <button className="newIdea" onClick={() => onCreate()}>Capturer une idée</button>
          </div>
        ) : (
          <div
            className="canvasViewport"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <svg className="mindSvg" width="100%" height="100%" viewBox="0 0 1200 800">
              <defs>
                <pattern id="dotGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <circle cx="15" cy="15" r="1.2" fill="#d1d6ce" />
                </pattern>
                <linearGradient id="sageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#21352f" />
                  <stop offset="100%" stopColor="#3d5e53" />
                </linearGradient>
                <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#21352f" floodOpacity="0.08" />
                </filter>
              </defs>

              <rect width="100%" height="100%" fill="#f6f5ef" />
              <rect width="100%" height="100%" fill="url(#dotGrid)" />

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {mode === "constellation" ? (
                  <>
                    {categories.map(cat => {
                      const coords = categoryCoords[cat];
                      return (
                        <line
                          key={`c-${cat}`}
                          x1={center.x}
                          y1={center.y}
                          x2={coords.x}
                          y2={coords.y}
                          stroke="#c0c7be"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                      );
                    })}

                    {ideas.map(idea => {
                      const catPos = categoryCoords[idea.category];
                      const ideaPos = ideaCoords[idea.id];
                      if (!catPos || !ideaPos) return null;
                      return (
                        <path
                          key={`link-${idea.id}`}
                          d={`M ${catPos.x} ${catPos.y} Q ${(catPos.x + ideaPos.x) / 2} ${(catPos.y + ideaPos.y) / 2 - 20} ${ideaPos.x} ${ideaPos.y}`}
                          stroke={idea.pinned ? "#d4af37" : "#899b92"}
                          strokeWidth={idea.pinned ? "2.5" : "1.5"}
                          opacity={idea.pinned ? "0.9" : "0.6"}
                          fill="none"
                        />
                      );
                    })}

                    {tagConnections.map((conn, idx) => {
                      const p1 = ideaCoords[conn.id1];
                      const p2 = ideaCoords[conn.id2];
                      if (!p1 || !p2) return null;
                      return (
                        <path
                          key={`tagConn-${idx}`}
                          d={`M ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2 + 15} ${(p1.y + p2.y) / 2 - 25} ${p2.x} ${p2.y}`}
                          stroke="#e0a96d"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                          opacity="0.75"
                          fill="none"
                        />
                      );
                    })}

                    <g transform={`translate(${center.x}, ${center.y})`} filter="url(#shadow)">
                      <circle r="36" fill="url(#sageGrad)" />
                      <text textAnchor="middle" dy="6" fill="#f4d89d" fontSize="24" fontFamily="serif" fontWeight="bold">✦</text>
                      <text textAnchor="middle" dy="48" fill="#21352f" fontSize="11" fontWeight="600" letterSpacing="1">JARDIN SPARK</text>
                    </g>

                    {categories.map(cat => {
                      const pos = categoryCoords[cat];
                      const count = ideas.filter(i => i.category === cat).length;
                      return (
                        <g key={`hub-${cat}`} transform={`translate(${pos.x}, ${pos.y})`} filter="url(#shadow)">
                          <rect x="-65" y="-18" width="130" height="36" rx="18" fill="#e8eee7" stroke="#3d5e53" strokeWidth="1.5" />
                          <text textAnchor="middle" dy="4" fill="#21352f" fontSize="12" fontWeight="700">{cat} ({count})</text>
                        </g>
                      );
                    })}

                    {ideas.map(idea => {
                      const pos = ideaCoords[idea.id];
                      if (!pos) return null;
                      return (
                        <g
                          key={`ideaNode-${idea.id}`}
                          transform={`translate(${pos.x}, ${pos.y})`}
                          filter="url(#shadow)"
                          style={{ cursor: "pointer" }}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedTreeId(idea.id);
                            onOpen(idea);
                          }}
                        >
                          <rect
                            x="-85"
                            y="-22"
                            width="170"
                            height="44"
                            rx="12"
                            fill={idea.pinned ? "#fffdf5" : "#ffffff"}
                            stroke={idea.pinned ? "#d4af37" : "#d0d7cf"}
                            strokeWidth={idea.pinned ? "2" : "1"}
                          />
                          {idea.pinned && (
                            <text x="-75" y="-6" fill="#d4af37" fontSize="12">★</text>
                          )}
                          <text
                            x={idea.pinned ? "-58" : "-72"}
                            y="2"
                            fill="#21352f"
                            fontSize="11"
                            fontWeight="600"
                          >
                            {idea.title.length > 20 ? idea.title.slice(0, 18) + "…" : idea.title}
                          </text>
                          <text x="-72" y="15" fill="#657770" fontSize="9">
                            {idea.status} • {idea.tags?.length ? `#${idea.tags[0]}` : idea.category}
                          </text>
                        </g>
                      );
                    })}
                  </>
                ) : (
                  selectedIdea && (
                    <g transform="translate(600, 350)">
                      <g filter="url(#shadow)">
                        <rect x="-140" y="-35" width="280" height="70" rx="16" fill="url(#sageGrad)" stroke="#172722" strokeWidth="2" />
                        {selectedIdea.pinned && <text x="-125" y="-10" fill="#f4d89d" fontSize="14">★</text>}
                        <text textAnchor="middle" y="-5" fill="#ffffff" fontSize="15" fontFamily="'Playfair Display', Georgia, serif" fontWeight="700">
                          {selectedIdea.title.length > 30 ? selectedIdea.title.slice(0, 28) + "…" : selectedIdea.title}
                        </text>
                        <text textAnchor="middle" y="16" fill="#d0dfda" fontSize="11">
                          {selectedIdea.category} • {selectedIdea.status}
                        </text>
                      </g>

                      {[
                        { key: "nextAction", label: "🎯 PROCHAINE ACTION", value: selectedIdea.nextAction || "Définir la première étape", angle: -140, color: "#466b5d" },
                        { key: "problem", label: "⚡ LE DÉCLIC", value: selectedIdea.problem || "Définir le problème à résoudre", angle: -40, color: "#8a5a36" },
                        { key: "audience", label: "👥 PUBLIC CIBLE", value: selectedIdea.audience || "Préciser le public concerné", angle: 40, color: "#2b5b75" },
                        { key: "potential", label: "💎 VALEUR / POTENTIEL", value: selectedIdea.potential || "Rédiger l'impact désiré", angle: 140, color: "#6b4668" },
                      ].map(branch => {
                        const rad = (branch.angle * Math.PI) / 180;
                        const bx = Math.cos(rad) * 280;
                        const by = Math.sin(rad) * 190;
                        return (
                          <g key={branch.key}>
                            <path
                              d={`M 0 0 Q ${bx / 2} ${by / 2 - 20} ${bx} ${by}`}
                              stroke={branch.color}
                              strokeWidth="2"
                              fill="none"
                              opacity="0.8"
                            />
                            <g transform={`translate(${bx}, ${by})`} filter="url(#shadow)">
                              <rect x="-110" y="-28" width="220" height="56" rx="10" fill="#ffffff" stroke={branch.color} strokeWidth="1.5" />
                              <text x="-98" y="-10" fill={branch.color} fontSize="9" fontWeight="700" letterSpacing="0.8">
                                {branch.label}
                              </text>
                              <text x="-98" y="10" fill="#21352f" fontSize="11" fontWeight="500">
                                {branch.value.length > 28 ? branch.value.slice(0, 26) + "…" : branch.value}
                              </text>
                            </g>
                          </g>
                        );
                      })}

                      {selectedIdea.tags && selectedIdea.tags.length > 0 && (
                        <g transform="translate(0, 230)" filter="url(#shadow)">
                          <line x1="0" y1="-195" x2="0" y2="0" stroke="#74817c" strokeWidth="1.5" strokeDasharray="3 3" />
                          <rect x="-120" y="-18" width="240" height="36" rx="18" fill="#e8eee7" stroke="#74817c" strokeWidth="1" />
                          <text textAnchor="middle" y="4" fill="#21352f" fontSize="11" fontWeight="600">
                            🏷️ Tags : {selectedIdea.tags.map(t => "#" + t).join(" ")}
                          </text>
                        </g>
                      )}

                      {(aiSubNodes[selectedIdea.id] ?? []).map((aiNode, idx) => {
                        const angle = 90 + (idx - 1) * 45;
                        const rad = (angle * Math.PI) / 180;
                        const ax = Math.cos(rad) * 320;
                        const ay = Math.sin(rad) * 220;
                        return (
                          <g key={aiNode.id}>
                            <path
                              d={`M 0 0 Q ${ax / 2} ${ay / 2} ${ax} ${ay}`}
                              stroke="#c79955"
                              strokeWidth="2"
                              strokeDasharray="4 2"
                              fill="none"
                            />
                            <g transform={`translate(${ax}, ${ay})`} filter="url(#shadow)">
                              <rect x="-125" y="-30" width="250" height="60" rx="12" fill="#fffdf5" stroke="#c79955" strokeWidth="2" />
                              <text x="-112" y="-12" fill="#a87428" fontSize="9" fontWeight="700">✦ IDÉE GERMÉE IA</text>
                              <text x="-112" y="8" fill="#21352f" fontSize="10" fontWeight="500">
                                {aiNode.label.length > 34 ? aiNode.label.slice(0, 32) + "…" : aiNode.label}
                              </text>
                              <text
                                x="110"
                                y="20"
                                textAnchor="end"
                                fill="#466b5d"
                                fontSize="9"
                                fontWeight="700"
                                style={{ cursor: "pointer" }}
                                onClick={() => onCreate(aiNode.label)}
                              >
                                ＋ Convertir en idée
                              </text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  )
                )}
              </g>
            </svg>
          </div>
        )}
      </div>
    </section>
  );
}
