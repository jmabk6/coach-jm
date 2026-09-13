interface ScreenProps {
  title: string;
}

export function Screen({ title }: ScreenProps) {
  return (
    <section>
      <h1>{title}</h1>
    </section>
  );
}
