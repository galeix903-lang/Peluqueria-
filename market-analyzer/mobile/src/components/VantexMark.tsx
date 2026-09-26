import { Image } from 'react-native';

/*
  Icono de marca: la misma imagen que usa la web (public/assets/
  vantex-mark.png, elegida por el usuario) — nunca una recreación en
  SVG, para que no haya divergencia visual entre plataformas.
*/
export function VantexMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      resizeMode="contain"
    />
  );
}
