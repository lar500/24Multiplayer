import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center gap-8 w-full max-w-2xl">
        <h1 className="text-5xl font-bold text-center">24 Game</h1>
        <p className="text-xl text-center">
          Challenge your math skills with the classic 24 game! Use the four
          numbers and basic operations to make 24.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md pt-8">
          <Link
            href="/singleplayer"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded text-center"
          >
            Singleplayer
          </Link>
          <Link
            href="/multiplayer"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded text-center"
          >
            Multiplayer
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <Link
            href="/speedrun"
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-6 rounded text-center"
          >
            Speedrun Mode
          </Link>

          <Link
            href="/solver"
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-4 px-6 rounded text-center"
          >
            Solver
          </Link>
        </div>
      </main>
    </div>
  );
}
