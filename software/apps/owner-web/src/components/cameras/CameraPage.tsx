import { Fragment, type ReactNode } from 'react';
import { Card, Empty, LinkBtn, Note } from '../ui';
import { useCamera, type CameraInfo } from '../../context/CameraContext';
import '../../styles/cameras.css';

/**
 * The frame every camera page sits in: says so when no camera is linked yet or the camera server cannot be reached, and otherwise
 * draws the page for the camera chosen in the top bar. The page is keyed by the camera, so choosing another camera starts it afresh
 * (no picture, plate or filter of the last camera is left behind).
 */
export default function CameraPage({ children }: { children: (camera: CameraInfo) => ReactNode }) {
  const cam = useCamera();
  const info = cam.currentInfo;

  if (!info) {
    if (cam.loading) return <Empty>Loading your cameras…</Empty>;
    return (
      <Card title="No camera yet">
        {cam.error ? <Note tone="bad">{cam.error}</Note> : null}
        <Empty>
          No camera is linked to you yet. A camera appears here once ParkFNB links it to your property, or when you pair it with the code ParkFNB gave you.
        </Empty>
        <div className="bar" style={{ justifyContent: 'center' }}>
          <LinkBtn to="/cameras" variant="primary">Go to Cameras</LinkBtn>
        </div>
      </Card>
    );
  }

  return (
    <Fragment key={info.id}>
      {cam.error ? <Note tone="warn">Could not refresh the cameras just now: {cam.error}</Note> : null}
      {!info.known ? (
        <Note tone="warn">
          The camera server has not heard from {info.label} yet. Once the camera sends its first picture, this page fills in.
        </Note>
      ) : null}
      {children(info)}
    </Fragment>
  );
}
