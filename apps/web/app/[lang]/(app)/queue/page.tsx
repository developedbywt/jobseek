import { QueuePage } from "./queue-page";

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function QueueRoute({ params }: Props) {
  await params;
  return <QueuePage />;
}
