import { Platform } from 'react-native';
import { enabled } from 'react-native-privacy-snapshot';
import { SettingStore } from '../stores/use-setting-store';
import { useSettingStore } from '../stores/use-setting-store';
import { AndroidModule } from '../utils';
import { getColorScheme } from '../utils/color-scheme/utils';
import { MMKV } from '../common/database/mmkv';
import { scale, updateSize } from '../utils/size';
import Notifications from './notifications';
import Orientation from 'react-native-orientation';
import { DDS } from './device-detection';

function migrate(settings: SettingStore['settings']) {
  if (settings.migrated) return true;

  let introCompleted = MMKV.getString('introCompleted');

  if (!introCompleted) {
    console.log('no need to migrate');
    settings.migrated = true;
    set(settings);
    return;
  }

  settings.introCompleted = true;
  MMKV.removeItem('introCompleted');
  console.log('migrated introCompleted', introCompleted);

  let askForRating = MMKV.getString('askForRating');
  if (askForRating) {
    if (askForRating === 'completed' || askForRating === 'never') {
      settings.rateApp = false;
    } else {
      askForRating = JSON.parse(askForRating);
      //@ts-ignore
      settings.rateApp = askForRating.timestamp;
    }
    console.log('migrated askForRating', askForRating);
    MMKV.removeItem('askForRating');
  }

  let askForBackup = MMKV.getString('askForBackup');
  if (askForBackup) {
    askForBackup = JSON.parse(askForBackup);
    //@ts-ignore
    settings.rateApp = askForBackup.timestamp;
    MMKV.removeItem('askForBackup');
    console.log('migrated askForBackup', askForBackup);
  }

  let lastBackupDate = MMKV.getString('backupDate');
  if (lastBackupDate) settings.lastBackupDate = parseInt(lastBackupDate);
  MMKV.removeItem('backupDate');
  console.log('migrated backupDate', lastBackupDate);

  let isUserEmailConfirmed = MMKV.getString('isUserEmailConfirmed');
  if (isUserEmailConfirmed === 'yes') settings.userEmailConfirmed = true;
  if (isUserEmailConfirmed === 'no') settings.userEmailConfirmed = false;
  console.log('migrated useEmailConfirmed', isUserEmailConfirmed);

  MMKV.removeItem('isUserEmailConfirmed');

  let userHasSavedRecoveryKey = MMKV.getString('userHasSavedRecoveryKey');
  if (userHasSavedRecoveryKey) settings.recoveryKeySaved = true;
  MMKV.removeItem('userHasSavedRecoveryKey');
  console.log('migrated userHasSavedRecoveryKey', userHasSavedRecoveryKey);

  let accentColor = MMKV.getString('accentColor');
  if (accentColor) settings.theme.accent = accentColor;
  MMKV.removeItem('accentColor');
  console.log('migrated accentColor', accentColor);

  let theme = MMKV.getString('theme');
  if (theme) {
    theme = JSON.parse(theme);
    //@ts-ignore
    if (theme.night) settings.theme.dark = true;
    MMKV.removeItem('theme');
  }

  console.log('migrated theme', theme);

  let backupStorageDir = MMKV.getString('backupStorageDir');
  if (backupStorageDir) settings.backupDirectoryAndroid = JSON.parse(backupStorageDir);
  MMKV.removeItem('backupStorageDir');
  console.log('migrated backupStorageDir', backupStorageDir);

  let dontShowCompleteSheet = MMKV.getString('dontShowCompleteSheet');
  if (dontShowCompleteSheet) settings.showBackupCompleteSheet = false;
  MMKV.removeItem('dontShowCompleteSheet');
  console.log('migrated dontShowCompleteSheet', dontShowCompleteSheet);

  settings.migrated = true;
  set(settings);
  console.log('migrated completed');

  return true;
}

function init() {
  scale.fontScale = 1;
  let settingsJson = MMKV.getString('appSettings');
  let settings = get();
  if (!settingsJson) {
    MMKV.setString('appSettings', JSON.stringify(settings));
  } else {
    settings = {
      ...settings,
      ...JSON.parse(settingsJson)
    };
  }
  if (settings.notifNotes) {
    Notifications.pinQuickNote(true);
  }

  if (settings.fontScale) {
    scale.fontScale = settings.fontScale;
  }
  setTimeout(() => setPrivacyScreen(settings));
  updateSize();
  useSettingStore.getState().setSettings({ ...settings });
  migrate(settings);
  getColorScheme();
  return;
}

function setPrivacyScreen(settings: SettingStore['settings']) {
  if (settings.privacyScreen || settings.appLockMode === 'background') {
    if (Platform.OS === 'android') {
      AndroidModule.setSecureMode(true);
    } else {
      enabled(true);
    }
  } else {
    if (Platform.OS === 'android') {
      AndroidModule.setSecureMode(false);
    } else {
      enabled(false);
    }
  }
}

function set(next: Partial<SettingStore['settings']>) {
  let settings = get();
  settings = {
    ...settings,
    ...next
  };

  useSettingStore.getState().setSettings(settings);
  setTimeout(async () => MMKV.setString('appSettings', JSON.stringify(settings)), 1);
}

function toggle(id: keyof SettingStore['settings']) {
  let settings = get();
  if (typeof settings[id] !== 'boolean') return;
  settings = {
    ...settings
  };
  //@ts-ignore
  settings[id] = !settings[id];
  useSettingStore.getState().setSettings(settings);
  MMKV.setString('appSettings', JSON.stringify(settings));
}

function get() {
  return { ...useSettingStore.getState().settings };
}

function onFirstLaunch() {
  let introCompleted = get().introCompleted;
  if (!introCompleted) {
    set({
      rateApp: Date.now() + 86400000 * 2,
      nextBackupRequestTime: Date.now() + 86400000 * 3
    });
  }
}

function checkOrientation() {
  //@ts-ignore
  Orientation.getOrientation((e, r) => {
    DDS.checkSmallTab(r);
    //@ts-ignore
    useSettingStore.getState().setDimensions({ width: DDS.width, height: DDS.height });
    useSettingStore
      .getState()
      .setDeviceMode(DDS.isLargeTablet() ? 'tablet' : DDS.isSmallTab ? 'smallTablet' : 'mobile');
  });
}

const SettingsService = {
  init,
  set,
  get,
  toggle,
  onFirstLaunch,
  checkOrientation
};

export default SettingsService;
