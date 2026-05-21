export default function LiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic role="status">
      {message}
    </div>
  );
}
