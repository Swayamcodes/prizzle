import { ConverterPanel } from '../components/ConverterPanel';
import { HeaderLinks, HeaderResources } from '../components/HeaderResources';

export default function Page(): React.JSX.Element {
  return (
    <main
      id="main-content"
      className="app-shell mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
    >
      <header className="site-header workspace-enter">
        <div>
          <p className="wordmark" translate="no">
            Prizzle
          </p>
          <h1 className="editorial-statement">Move between Prisma and Drizzle.</h1>
          <p className="site-description">
            Paste a schema, convert it in either direction, and review anything that needs your
            attention.
          </p>
        </div>
        <HeaderLinks />
      </header>
      <HeaderResources />
      <ConverterPanel />
    </main>
  );
}
