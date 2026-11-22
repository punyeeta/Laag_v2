// Ten background/text pairs, picked by joinOrder mod 10, so a person has the
// same color on every device. None uses the primary blue or the uncertain red,
// and the initials, not the color, identify the person.
const PAIRS: [string, string][] = [
  ['#CCF1EC', '#0B5E56'],
  ['#FDDDC4', '#8A3B0A'],
  ['#E0DAFA', '#4527A0'],
  ['#FBEBC2', '#7A4A00'],
  ['#FAD6E6', '#8C1D4F'],
  ['#D8F0D5', '#1F5E1A'],
  ['#CDEBF7', '#0B5571'],
  ['#EDD5F2', '#6A1F7A'],
  ['#E9EDC9', '#4A5410'],
  ['#EADFD6', '#5C3D2A'],
];

/**
 * One letter, or two when someone else on the trip shares the first letter:
 * two names starting with "R" become "Ro" and "Re", while a lone "C" name stays "C".
 */
export function initials(name: string, peers: string[] = []) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  const n = parts[0];
  const first = n[0].toUpperCase();
  const clash = peers.some((p) => p !== name && p.trim()[0]?.toUpperCase() === first);
  return clash && n.length > 1 ? first + n[1].toLowerCase() : first;
}

export function Avatar({
  name,
  joinOrder,
  size = 36,
  peers,
}: {
  name: string;
  joinOrder: number;
  size?: number;
  peers?: string[];
}) {
  const [bg, fg] = PAIRS[((joinOrder % 10) + 10) % 10];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name, peers)}
    </span>
  );
}

export function AvatarStack({ people }: { people: { id: string; name: string; joinOrder: number }[] }) {
  const names = people.map((p) => p.name);
  return (
    <div className="flex -space-x-1.5">
      {people.map((p) => (
        <span key={p.id} className="rounded-full ring-2 ring-paper" title={p.name}>
          <Avatar name={p.name} joinOrder={p.joinOrder} size={30} peers={names} />
        </span>
      ))}
    </div>
  );
}
