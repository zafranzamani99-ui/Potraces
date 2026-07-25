import { Composition } from 'remotion';
import { PotracesPromo } from './PotracesPromo';
import { CollectzPromo } from './CollectzPromo';
import { EchoPromo } from './EchoPromo';
import { DebtPromo } from './DebtPromo';
import { HutangPromo } from './HutangPromo';
import { WhyPromo } from './WhyPromo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EchoPromo"
        component={EchoPromo}
        durationInFrames={1980} // ~33s @ 60fps
        fps={60}
        width={1080}
        height={1920}
      />
      <Composition
        id="CollectzPromo"
        component={CollectzPromo}
        durationInFrames={1920} // 32s @ 60fps
        fps={60}
        width={1080}
        height={1920}
      />
      <Composition
        id="DebtPromo"
        component={DebtPromo}
        durationInFrames={2398} // 40.0s @ 60fps
        fps={60}
        width={1080}
        height={1920}
      />
      <Composition
        id="HutangPromo"
        component={HutangPromo}
        durationInFrames={2559} // 42.7s @ 60fps
        fps={60}
        width={1080}
        height={1920}
      />
      <Composition
        id="WhyPromo"
        component={WhyPromo}
        durationInFrames={4460} // 74.3s @ 60fps
        fps={60}
        width={1080}
        height={1920}
      />
      <Composition
        id="PotracesPromo"
        component={PotracesPromo}
        durationInFrames={330} // 11s @ 30fps
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
