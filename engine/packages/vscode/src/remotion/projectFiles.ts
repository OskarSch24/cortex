import { FPS, type MaterialItem } from './media.js';

/** Die Dateien der Projektvorlage, die Cortex anlegt, und die Materialliste darin. */

export const REMOTION_VERSION = '4.0.527';

const DEPENDENCIES = {
  '@remotion/cli': REMOTION_VERSION,
  remotion: REMOTION_VERSION,
  react: '19.2.3',
  'react-dom': '19.2.3',
};
const DEV_DEPENDENCIES = { '@types/react': '19.2.7', typescript: '5.9.3' };

export function materialSource(items: MaterialItem[]): string {
  return `// Von Cortex angelegt: was dem Auftrag angehängt war, in dieser Reihenfolge.
// Die Dateien liegen unter public/. Du darfst die Liste ändern oder ersetzen.
export type MaterialItem = { file: string; kind: 'video' | 'image' | 'audio'; frames: number; width?: number; height?: number };

export const material: MaterialItem[] = ${JSON.stringify(items, null, 2)};
`;
}

/** Liest zurück, was `materialSource` geschrieben hat. Wirft, wenn die Liste von Hand unlesbar gemacht wurde. */
export function parseMaterialList(text: string): MaterialItem[] {
  return JSON.parse(/material: MaterialItem\[\] = ([\s\S]*);\s*$/.exec(text)?.[1] ?? '[]') as MaterialItem[];
}

const ROOT = `import { Composition } from 'remotion';
import { Material, materialFrames } from './Material';
import { material } from './materialList';

// Das erste Video bestimmt das Format, sonst Full HD.
const first = material.find(item => item.kind === 'video' && item.width && item.height);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Material"
      component={Material}
      durationInFrames={Math.max(1, materialFrames(material))}
      fps={${FPS}}
      width={first?.width ?? 1920}
      height={first?.height ?? 1080}
    />
  </>
);
`;

const MATERIAL = `import { AbsoluteFill, Html5Audio, Img, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { material, type MaterialItem } from './materialList';

/** Bilder und Videos folgen aufeinander; Töne laufen darunter ab dem Anfang. */
export const materialFrames = (items: MaterialItem[]) =>
  Math.max(items.filter(item => item.kind !== 'audio').reduce((sum, item) => sum + item.frames, 0), ...items.filter(item => item.kind === 'audio').map(item => item.frames), 0);

export const Material: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {material.map(item => {
        if (item.kind === 'audio') return <Html5Audio key={item.file} src={staticFile(item.file)} />;
        const start = from;
        from += item.frames;
        return (
          <Sequence key={item.file} from={start} durationInFrames={item.frames} name={item.file.split('/').pop()}>
            {item.kind === 'video'
              ? <OffthreadVideo src={staticFile(item.file)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <Img src={staticFile(item.file)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;

export const FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'cortex-video',
    version: '1.0.0',
    private: true,
    description: 'Video aus Cortex, gebaut mit Remotion',
    scripts: { dev: 'remotion studio', build: 'remotion bundle', render: 'remotion render' },
    dependencies: DEPENDENCIES,
    devDependencies: DEV_DEPENDENCIES,
  }, null, 2) + '\n',
  'remotion.config.ts': `import { Config } from '@remotion/cli/config';\n\nConfig.setVideoImageFormat('jpeg');\nConfig.setOverwriteOutput(true);\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2018', module: 'commonjs', jsx: 'react-jsx', strict: true, noEmit: true, lib: ['es2015', 'DOM'], esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true } }, null, 2) + '\n',
  '.gitignore': 'node_modules\nout\n.DS_Store\n.env\n',
  'src/index.ts': `import { registerRoot } from 'remotion';\nimport { RemotionRoot } from './Root';\n\nregisterRoot(RemotionRoot);\n`,
  'src/Root.tsx': ROOT,
  'src/Material.tsx': MATERIAL,
};
