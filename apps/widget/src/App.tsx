import { Storefront } from './components/storefront/Storefront';
import { Widget } from './components/widget/Widget';

/** Embedded on a real storefront (via embed.js) — render only the widget. */
const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1';

export default function App() {
  if (isEmbed) {
    return <Widget />;
  }
  return (
    <div className="relative h-full">
      <Storefront />
      <Widget />
    </div>
  );
}
