import { Storefront } from './components/storefront/Storefront';
import { Widget } from './components/widget/Widget';

export default function App() {
  return (
    <div className="relative h-full">
      <Storefront />
      <Widget />
    </div>
  );
}
