import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./styles.css";
import { loadIndex, storageMode } from "./data.js";
import { Icon } from "./util.jsx";
import { Home } from "./screens/Home.jsx";
import { NewPaper } from "./screens/NewPaper.jsx";
import { Editor } from "./screens/Editor.jsx";
import { Browse } from "./screens/Browse.jsx";
import { Papers } from "./screens/Papers.jsx";

function useRoute() {
  const get = () => (location.hash.replace(/^#/, "") || "/");
  const [route, setRoute] = useState(get());
  useEffect(() => {
    const on = () => { setRoute(get()); window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path) => { location.hash = path; };

function App() {
  const route = useRoute();
  const [idx, setIdx] = useState(null);
  const [mode, setMode] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadIndex().then(setIdx).catch((e) => setError(e.message));
    storageMode().then(setMode);
  }, []);

  let screen;
  if (error) screen = <div class="card error">Sorry, the question bank could not be loaded. Please refresh the page. ({error})</div>;
  else if (!idx) screen = <p class="loading">Loading the question bank…</p>;
  else if (route === "/new") screen = <NewPaper idx={idx} />;
  else if (route.startsWith("/paper/")) screen = <Editor idx={idx} id={decodeURIComponent(route.slice(7))} key={route} />;
  else if (route === "/browse") screen = <Browse idx={idx} />;
  else if (route === "/papers") screen = <Papers idx={idx} />;
  else screen = <Home idx={idx} mode={mode} />;

  const nav = (path, label, icon) => (
    <a href={"#" + path} class={route === path || (path === "/papers" && route.startsWith("/paper/")) ? "active" : ""}>
      <Icon name={icon} /> {label}
    </a>
  );

  return (
    <>
      <header class="topbar">
        <a href="#/" class="brand"><span class="logo">EB</span> Exam Builder</a>
        <nav>
          {nav("/new", "New paper", "plus")}
          {nav("/papers", "My papers", "folder")}
          {nav("/browse", "Question bank", "book")}
        </nav>
      </header>
      <main>{screen}</main>
      {mode === "local" && (
        <footer class="footnote">Papers are saved in this browser on this computer.</footer>
      )}
    </>
  );
}

render(<App />, document.getElementById("app"));
