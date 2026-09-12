import Link from "next/link";

export function ResearchHorseNameLink({
  horseId,
  horseName,
}: {
  horseId: string | null | undefined;
  horseName: string;
}) {
  const id = horseId?.trim();
  if (!id) {
    return <span className="font-medium text-emerald-800">{horseName}</span>;
  }
  return (
    <Link
      className="font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
      href={`/horses/${id}`}
    >
      {horseName}
    </Link>
  );
}
