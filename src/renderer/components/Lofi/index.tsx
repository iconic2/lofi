import * as React from 'react';
import * as settings from 'electron-settings';
import { ipcRenderer, remote } from 'electron'
import { startAuthServer, stopAuthServer } from '../../../main/server';
import { CONTAINER, MAX_SIDE_LENGTH, MIN_SIDE_LENGTH } from '../../../constants'; 
import Cover from './Cover';
import Settings from './Settings';
import About from './About';
import Welcome from './Welcome';
import WindowPortal from '../util/WindowPortal'
import { ChangeEvent } from 'electron-settings';

import './style.scss'

enum SIDE {
  LEFT, RIGHT
}

class Lofi extends React.Component<any, any> {
  constructor(props: any) {
    super(props);

    this.state = {
      access_token: settings.getSync('spotify.access_token'),
      refresh_token: settings.getSync('spotify.refresh_token'),
      showSettings: false,
      showAbout: false,
      lofiSettings: settings.getSync('lofi'),
      side_length: settings.getSync('lofi.window.side'),
      window_side: (() => {
        if (((remote.getCurrentWindow().getBounds().x + remote.getCurrentWindow().getBounds().width) / 2) - remote.screen.getDisplayMatching(remote.getCurrentWindow().getBounds()).bounds.x < remote.screen.getDisplayMatching(remote.getCurrentWindow().getBounds()).bounds.width / 2) {
          return SIDE.LEFT
        }
        return SIDE.RIGHT
      })(),
      auth: false,
    }

    // Allow to open settings via IPC channel (e.g. triggered by a taskbar click)
    ipcRenderer.on('show-settings', () => {
      this.showSettingsWindow();
    })

    // Allow to open settings via IPC channel (e.g. triggered by a taskbar click)
    ipcRenderer.on('show-about', () => {
      this.showAboutWindow();
    })
  }

  reloadSettings() {
    this.setState({lofiSettings: settings.getSync('lofi')})
  }
  
  async verifyAccessToken(observer?: SettingsObserver) {
    console.log('Verifying access token...')
    if (observer) {
      observer.dispose();
    }
    let res = await fetch('https://api.spotify.com/v1/me', {
      method: 'GET',
      headers: new Headers({
        'Authorization': 'Bearer '+ this.state.access_token
      })
    });
    if (res.status === 200) {
      this.setState({
        auth: true
      });
    } else {
      this.refreshAccessToken();
    }
  }

  async refreshAccessToken() {
    console.log('Access token was bad... renewing');
    let res = await fetch('http://auth.lofi.rocks/refresh_token?refresh_token=' + this.state.refresh_token);
    if (res.status === 200) {
      const access_token = (await res.json()).access_token;
      settings.set('spotify.access_token', access_token)
      this.setState({
        access_token,
        auth: true
      });
    } else {
      // Something is very, very wrong -- nuke auth settings
      settings.delete('spotify.access_token');
      settings.delete('spotify.refresh_token');
      this.setState({
        refresh_token: null,
        access_token: null,
        auth: false
      });
      this.handleAuth();
    }
  }

  async handleAuth() {
    console.log('Starting authentication process...');
    startAuthServer();
    // No token data! Make sure we wait for authentication
    if (!this.state.refresh_token) {
      let observer: SettingsObserver = settings.observe('spotify', (evt: ChangeEvent) => {
        this.setState({
          refresh_token: evt.newValue.refresh_token,
          access_token: evt.newValue.access_token
        });
        this.verifyAccessToken(observer);
        stopAuthServer();
      });
    } else {
      this.verifyAccessToken(null);
    }
  }

  componentDidMount() {
    this.handleAuth();

    // Move the window when dragging specific element without cannibalizing events
    // Credit goes out to @danielravina
    // See: https://github.com/electron/electron/issues/1354#issuecomment-404348957
    
    const that = this;
    let animationId: number;
    let mouseX: number;
    let mouseY: number;
    let mouseDeltaX: number;
    let mouseDeltaY: number;

    function onMouseMove(e: any) {
      mouseDeltaX = e.clientX;
      mouseDeltaY = e.clientY;
    }

    function onMouseDown(e: any) {
        if (leftMousePressed(e) && !e.target['classList'].contains('not-draggable')) {
          // Cancel old animation frame, fixes mouse getting "stuck" in the drag state
          cancelAnimationFrame(animationId);
          mouseX = e.clientX;
          mouseY = e.clientY;
          document.addEventListener('mouseup', onMouseUp)
          if (e.target['classList'].contains('grab-resize')) {
            requestAnimationFrame(resizeWindow.bind(that, e.target['classList'].contains('top'), e.target['classList'].contains('right')));
            document.body.classList.remove("click-through");
          } else {
            requestAnimationFrame(moveWindow);
          }
        }
    }

    function onMouseUp(e: MouseEvent) {
        if (leftMousePressed(e)) {
          ipcRenderer.send('windowMoved', { mouseX, mouseY });
          document.removeEventListener('mouseup', onMouseUp)
          cancelAnimationFrame(animationId)
          document.body.classList.add("click-through");
        }
    }

    let resizeWindow = (function(top: boolean, right: boolean) {
      let length = that.state.side_length;

      // TODO: The math here can be simplified, but leaving it explicit for now
      if (top && right) {
        const handleX = (CONTAINER.HORIZONTAL / 2) + that.state.side_length / 2;
        const handleY = (CONTAINER.VERTICAL / 2) - that.state.side_length / 2;
        const dX = handleX + mouseDeltaX;
        const dY = handleY - mouseDeltaY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      } else if (top && !right) {
        const handleX = (CONTAINER.HORIZONTAL / 2) - that.state.side_length / 2;
        const handleY = (CONTAINER.VERTICAL / 2) - that.state.side_length / 2;
        const dX = handleX - mouseDeltaX;
        const dY = handleY - mouseDeltaY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      } else if (!top && right) {
        const handleX = (CONTAINER.HORIZONTAL / 2) + that.state.side_length / 2;
        const handleY = (CONTAINER.VERTICAL / 2) + that.state.side_length / 2;
        const dX = mouseDeltaX - handleX;
        const dY = mouseDeltaY - handleY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      } else if (!top && !right) {
        const handleX = (CONTAINER.HORIZONTAL / 2) - that.state.side_length / 2;
        const handleY = (CONTAINER.VERTICAL / 2) + that.state.side_length / 2;
        const dX = handleX - mouseDeltaX;
        const dY = handleY + mouseDeltaY;
        if (Math.abs(dX) >= Math.abs(dY)) {
          length += dY;
        } else {
          length += dX;
        }
      }

      // Maximum side length constraints
      if (length <= MAX_SIDE_LENGTH && length >= MIN_SIDE_LENGTH) {
        ipcRenderer.send('windowResizing', length);
        that.setState({ side_length: length })
      }

      animationId = requestAnimationFrame(resizeWindow.bind(that, top, right));
    })

    let moveWindow = (function() {
        ipcRenderer.send('windowMoving', { mouseX, mouseY });
        if (remote.screen.getCursorScreenPoint().x - remote.screen.getDisplayMatching(remote.getCurrentWindow().getBounds()).bounds.x < remote.screen.getDisplayMatching(remote.getCurrentWindow().getBounds()).bounds.width / 2) {
          that.setState({window_side: SIDE.LEFT});
        } else {
          that.setState({window_side: SIDE.RIGHT});
        }
        animationId = requestAnimationFrame(moveWindow);
    }).bind(that);

    function leftMousePressed(e: MouseEvent) {
        var button = e.which || e.button;
        return button === 1;
    }
    
    document.getElementById('visible-ui').addEventListener("mousedown", onMouseDown);
    document.getElementById('app-body').addEventListener("mousemove", onMouseMove);
  }

  showAboutWindow() {
    if (!this.state.showAbout) {
      this.setState({showAbout: true})
    }
  }
  
  hideAboutWindow() {
    this.setState({showAbout: false});
  }

  showSettingsWindow() {
    if (!this.state.showSettings) {
      this.setState({showSettings: true})
    }
  }

  hideSettingsWindow() {
    this.setState({showSettings: false});
  }

  render() {
    return (
      <div id='visible-ui' className='click-on' style={{height: this.state.side_length, width: this.state.side_length, left: `calc(50% - ${this.state.side_length / 2}px)`}}>
        <div className="top left grab-resize"></div>
        <div className="top right grab-resize"></div>
        <div className="bottom left grab-resize"></div>
        <div className="bottom right grab-resize"></div>
        { this.state.showSettings ? <WindowPortal fullscreen onUnload={this.hideSettingsWindow.bind(this)} name="settings"><Settings lofi={this} className="settings-wnd"/></WindowPortal> : null }
        { this.state.showAbout ? <WindowPortal fullscreen onUnload={this.hideAboutWindow.bind(this)} name="about"><About lofi={this} className="about-wnd"/></WindowPortal> : null }
        { this.state.auth ? <Cover visualizationId={this.state.lofiSettings.visualization} settings={this.state.lofiSettings.window} side={this.state.window_side} lofi={this} token={this.state.access_token} /> : <Welcome lofi={this} /> }
      </div>
    );
  }
}

export default Lofi;
