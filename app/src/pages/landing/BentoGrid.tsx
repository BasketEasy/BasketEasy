import { Badge } from '@basketeasy/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@basketeasy/ui/card';
import { BENTO_FEATURES } from './data';

// Spans per the spec's bento layout: card 1 and card 4 are wide (2 cols),
// cards 2 and 3 are narrow (1 col).
const SPAN_BY_INDEX = ['md:col-span-2', 'md:col-span-1', 'md:col-span-1', 'md:col-span-2'];

export function BentoGrid() {
  return (
    <section className="bg-court py-24 text-cream">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {BENTO_FEATURES.map((feature, index) => (
            <Card key={feature.title} className={`border-white/10 bg-card ${SPAN_BY_INDEX[index]}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-cream">{feature.title}</CardTitle>
                  {feature.badge && <Badge variant="secondary">{feature.badge}</Badge>}
                </div>
                <CardDescription className="text-stone-400">{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
