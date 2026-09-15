import { ConverterPanel } from '../components/ConverterPanel';

export default function Page(): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen max-w-7xl bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Prizzle schema converter</h1>
        <p className="mt-2 text-slate-600">Convert Prisma and Drizzle schemas while keeping conversion details visible.</p>
      </header>
      <ConverterPanel />
    </main>
  );
}
