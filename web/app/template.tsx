// Re-mounts on every navigation, so each page arrives with a soft rise-and-focus transition.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
