// Functional skeleton of the whole app flow (PLAN.md §1), built against the shared fixture.
// Deliberately plain styling: this shows how the product works, not how it should look.
import { Footer, Nav } from "./mockup/components";
import { AppProvider, useApp } from "./mockup/state";
import { Daily, Share, Unmask } from "./mockup/screens/After";
import { Ballot } from "./mockup/screens/Ballot";
import { ContestScreen } from "./mockup/screens/Contest";
import { Deck } from "./mockup/screens/Deck";
import { HowItWorks, Report } from "./mockup/screens/Info";
import { Lookup, Welcome } from "./mockup/screens/Intro";

function Router() {
  const { state } = useApp();
  const s = state.screen;
  switch (s.name) {
    case "welcome":
      return <Welcome />;
    case "lookup":
      return <Lookup />;
    case "ballot":
      return <Ballot />;
    case "deck":
      return <Deck key={s.deck} deck={s.deck} />;
    case "contest":
      return <ContestScreen key={s.id} id={s.id} />;
    case "unmask":
      return <Unmask />;
    case "share":
      return <Share />;
    case "daily":
      return <Daily />;
    case "how":
      return <HowItWorks />;
    case "report":
      return <Report contestId={s.contestId} />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <Nav />
      <Router />
      <Footer />
    </AppProvider>
  );
}
