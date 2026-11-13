/**
 * Icons from Remix Icon (remixicon.com, Apache-2.0), inlined as SVG so only the ones used are shipped.
 * Add an icon: import its file from remixicon/icons/<Category>/ and list it in ICONS.
 */
import iBus2Fill from 'remixicon/icons/Map/bus-2-fill.svg?raw';
import iSunFill from 'remixicon/icons/Weather/sun-fill.svg?raw';
import iSunFoggyFill from 'remixicon/icons/Weather/sun-foggy-fill.svg?raw';
import iHazeFill from 'remixicon/icons/Weather/haze-fill.svg?raw';
import iMoonFill from 'remixicon/icons/Weather/moon-fill.svg?raw';
import iCoinFill from 'remixicon/icons/Finance/coin-fill.svg?raw';
import iGroupFill from 'remixicon/icons/User & Faces/group-fill.svg?raw';
import iPauseFill from 'remixicon/icons/Media/pause-fill.svg?raw';
import iPlayFill from 'remixicon/icons/Media/play-fill.svg?raw';
import iVolumeUpFill from 'remixicon/icons/Media/volume-up-fill.svg?raw';
import iVolumeMuteFill from 'remixicon/icons/Media/volume-mute-fill.svg?raw';
import iBookOpenFill from 'remixicon/icons/Document/book-open-fill.svg?raw';
import iBook2Fill from 'remixicon/icons/Document/book-2-fill.svg?raw';
import iLockFill from 'remixicon/icons/System/lock-fill.svg?raw';
import iLightbulbFill from 'remixicon/icons/Others/lightbulb-fill.svg?raw';
import iSettings3Fill from 'remixicon/icons/System/settings-3-fill.svg?raw';
import iPinDistanceFill from 'remixicon/icons/Map/pin-distance-fill.svg?raw';
import iAddLine from 'remixicon/icons/System/add-line.svg?raw';
import iSubtractLine from 'remixicon/icons/System/subtract-line.svg?raw';
import iCloseLine from 'remixicon/icons/System/close-line.svg?raw';
import iArrowLeftSLine from 'remixicon/icons/Arrows/arrow-left-s-line.svg?raw';
import iArrowRightSLine from 'remixicon/icons/Arrows/arrow-right-s-line.svg?raw';
import iRouteFill from 'remixicon/icons/Map/route-fill.svg?raw';
import iTimerFill from 'remixicon/icons/System/timer-fill.svg?raw';
import iEmotionLaughFill from 'remixicon/icons/User & Faces/emotion-laugh-fill.svg?raw';
import iEmotionHappyFill from 'remixicon/icons/User & Faces/emotion-happy-fill.svg?raw';
import iEmotionNormalFill from 'remixicon/icons/User & Faces/emotion-normal-fill.svg?raw';
import iEmotionUnhappyFill from 'remixicon/icons/User & Faces/emotion-unhappy-fill.svg?raw';
import iEmotionSadFill from 'remixicon/icons/User & Faces/emotion-sad-fill.svg?raw';
import iAlarmWarningFill from 'remixicon/icons/System/alarm-warning-fill.svg?raw';
import iMapPinAddFill from 'remixicon/icons/Map/map-pin-add-fill.svg?raw';
import iSpeedFill from 'remixicon/icons/Media/speed-fill.svg?raw';
import iTaxiFill from 'remixicon/icons/Map/taxi-fill.svg?raw';
import iSparkling2Fill from 'remixicon/icons/Weather/sparkling-2-fill.svg?raw';

const ICONS = {
  'bus-2-fill': iBus2Fill,
  'sun-fill': iSunFill,
  'sun-foggy-fill': iSunFoggyFill,
  'haze-fill': iHazeFill,
  'moon-fill': iMoonFill,
  'coin-fill': iCoinFill,
  'group-fill': iGroupFill,
  'pause-fill': iPauseFill,
  'play-fill': iPlayFill,
  'volume-up-fill': iVolumeUpFill,
  'volume-mute-fill': iVolumeMuteFill,
  'book-open-fill': iBookOpenFill,
  'book-2-fill': iBook2Fill,
  'lock-fill': iLockFill,
  'lightbulb-fill': iLightbulbFill,
  'settings-3-fill': iSettings3Fill,
  'pin-distance-fill': iPinDistanceFill,
  'add-line': iAddLine,
  'subtract-line': iSubtractLine,
  'close-line': iCloseLine,
  'arrow-left-s-line': iArrowLeftSLine,
  'arrow-right-s-line': iArrowRightSLine,
  'route-fill': iRouteFill,
  'timer-fill': iTimerFill,
  'emotion-laugh-fill': iEmotionLaughFill,
  'emotion-happy-fill': iEmotionHappyFill,
  'emotion-normal-fill': iEmotionNormalFill,
  'emotion-unhappy-fill': iEmotionUnhappyFill,
  'emotion-sad-fill': iEmotionSadFill,
  'alarm-warning-fill': iAlarmWarningFill,
  'map-pin-add-fill': iMapPinAddFill,
  'speed-fill': iSpeedFill,
  'taxi-fill': iTaxiFill,
  'sparkling-2-fill': iSparkling2Fill,
} as const;

export type IconName = keyof typeof ICONS;

/** Inline SVG markup for an icon; it takes the size and colour of the text around it. */
export function icon(name: IconName, cls = ''): string {
  return `<span class="ico${cls ? ` ${cls}` : ''}" aria-hidden="true">${ICONS[name]}</span>`;
}
