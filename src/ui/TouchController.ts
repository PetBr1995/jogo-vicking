export interface VirtualInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  stickX: number;
  stickY: number;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
  attackJustPressed: boolean;
  dashJustPressed: boolean;
  toggleModeJustPressed: boolean;
}

/**
 * Controlador de Toque e Joystick Virtual Responsivo para Celular e Tablet
 */
export class TouchController {
  private target: VirtualInputState;
  private container: HTMLElement | null = null;
  private joystickBase: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  private joystickTouchId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private maxRadius = 45; // raio máximo do polegar em pixels
  public isVisible = false;

  constructor(target: VirtualInputState) {
    this.target = target;
    this.createDomElements();
    this.checkAutoVisibility();

    window.addEventListener('resize', () => this.checkAutoVisibility());

    const toggleBtn = document.getElementById('btn-toggle-touch');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleVisible();
      });
    }
  }

  /**
   * Detecta se o dispositivo é tablet/celular ou se a tela é pequena (<= 1024px)
   */
  public checkAutoVisibility() {
    const isMobileWidth = window.innerWidth <= 1024;
    const isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches;

    this.setVisible(isMobileWidth || isTouchDevice);
  }

  public setVisible(show: boolean) {
    this.isVisible = show;
    if (this.container) {
      this.container.style.display = show ? 'block' : 'none';
      if (show) {
        this.updateJoystickPosition();
      }
    }
    const toggleBtn = document.getElementById('btn-toggle-touch');
    if (toggleBtn) {
      if (show) toggleBtn.classList.add('active');
      else toggleBtn.classList.remove('active');
    }
  }

  public toggleVisible() {
    this.setVisible(!this.isVisible);
  }

  private triggerHaptic() {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        // Ignora caso permissão não concedida
      }
    }
  }

  private createDomElements() {
    // 1. Container geral que cobre a tela
    const layer = document.createElement('div');
    layer.id = 'touch-controls-layer';
    layer.className = 'touch-controls';
    layer.style.display = 'none';

    // 2. Zona do Joystick (Canto inferior esquerdo)
    const joyZone = document.createElement('div');
    joyZone.id = 'touch-joystick-zone';
    joyZone.className = 'touch-zone touch-joystick-zone';

    const joyBase = document.createElement('div');
    joyBase.id = 'touch-joystick-base';
    joyBase.className = 'joystick-base';

    const joyKnob = document.createElement('div');
    joyKnob.id = 'touch-joystick-knob';
    joyKnob.className = 'joystick-knob';

    // Indicadores direcionais discretos na base do joystick
    const dUp = document.createElement('span'); dUp.className = 'joy-arrow joy-arrow-up'; dUp.innerText = '▲';
    const dDown = document.createElement('span'); dDown.className = 'joy-arrow joy-arrow-down'; dDown.innerText = '▼';
    const dLeft = document.createElement('span'); dLeft.className = 'joy-arrow joy-arrow-left'; dLeft.innerText = '◀';
    const dRight = document.createElement('span'); dRight.className = 'joy-arrow joy-arrow-right'; dRight.innerText = '▶';

    joyBase.appendChild(dUp);
    joyBase.appendChild(dDown);
    joyBase.appendChild(dLeft);
    joyBase.appendChild(dRight);
    joyBase.appendChild(joyKnob);
    joyZone.appendChild(joyBase);

    // 3. Zona dos Botões de Ação (Canto inferior direito)
    const actionsZone = document.createElement('div');
    actionsZone.id = 'touch-actions-zone';
    actionsZone.className = 'touch-zone touch-actions-zone';

    // Botão de Ataque (⚔️ J - Principal, maior)
    const btnAttack = document.createElement('button');
    btnAttack.id = 'btn-touch-attack';
    btnAttack.className = 'touch-btn btn-attack';
    btnAttack.innerHTML = '<span class="btn-icon">⚔️</span><span class="btn-sub">ATAQUE</span>';

    // Botão de Pulo (🦘 Espaço)
    const btnJump = document.createElement('button');
    btnJump.id = 'btn-touch-jump';
    btnJump.className = 'touch-btn btn-jump';
    btnJump.innerHTML = '<span class="btn-icon">🦘</span><span class="btn-sub">PULO</span>';

    // Botão de Dash (⚡ K)
    const btnDash = document.createElement('button');
    btnDash.id = 'btn-touch-dash';
    btnDash.className = 'touch-btn btn-dash';
    btnDash.innerHTML = '<span class="btn-icon">⚡</span><span class="btn-sub">DASH</span>';

    // Botão de Modo Elemental (🔥 T - Surtur / Thor / Base)
    const btnMode = document.createElement('button');
    btnMode.id = 'btn-touch-mode';
    btnMode.className = 'touch-btn btn-mode';
    btnMode.innerHTML = '<span class="btn-icon">🔥</span><span class="btn-sub">MODO</span>';

    actionsZone.appendChild(btnMode);
    actionsZone.appendChild(btnDash);
    actionsZone.appendChild(btnJump);
    actionsZone.appendChild(btnAttack);

    layer.appendChild(joyZone);
    layer.appendChild(actionsZone);
    document.body.appendChild(layer);

    this.container = layer;
    this.joystickBase = joyBase;
    this.joystickKnob = joyKnob;

    this.setupJoystickEvents(joyZone);
    this.setupButtonEvents(btnAttack, () => {
      this.target.attackJustPressed = true;
      this.triggerHaptic();
    });
    this.setupButtonEvents(btnJump, () => {
      this.target.jumpJustPressed = true;
      this.target.jumpHeld = true;
      this.triggerHaptic();
    }, () => {
      this.target.jumpHeld = false;
    });
    this.setupButtonEvents(btnDash, () => {
      this.target.dashJustPressed = true;
      this.triggerHaptic();
    });
    this.setupButtonEvents(btnMode, () => {
      this.target.toggleModeJustPressed = true;
      this.triggerHaptic();
    });
  }

  private updateJoystickPosition() {
    if (!this.joystickBase) return;
    const rect = this.joystickBase.getBoundingClientRect();
    this.joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  private setupJoystickEvents(zone: HTMLElement) {
    const onStart = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.joystickTouchId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.updateJoystickPosition();
      this.handleJoystickMove(e.clientX, e.clientY);
    };

    const onMove = (e: PointerEvent) => {
      if (this.joystickTouchId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.handleJoystickMove(e.clientX, e.clientY);
    };

    const onEnd = (e: PointerEvent) => {
      if (this.joystickTouchId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.joystickTouchId = null;
      try {
        zone.releasePointerCapture(e.pointerId);
      } catch {
        // Ignora se já liberado
      }
      this.resetJoystick();
    };

    zone.addEventListener('pointerdown', onStart);
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerup', onEnd);
    zone.addEventListener('pointercancel', onEnd);
  }

  private handleJoystickMove(clientX: number, clientY: number) {
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, this.maxRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    }

    // Normalização (-1 a 1)
    const normX = clampedDist > 0 ? (knobX / this.maxRadius) : 0;
    const normY = clampedDist > 0 ? (knobY / this.maxRadius) : 0;

    this.target.stickX = normX;
    this.target.stickY = normY;

    // Deadzone de 22% para evitar falsos positivos
    const deadzone = 0.22;
    this.target.left = normX < -deadzone;
    this.target.right = normX > deadzone;
    this.target.up = normY < -deadzone;
    this.target.down = normY > deadzone;
  }

  private resetJoystick() {
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate(0px, 0px)';
    }
    this.target.stickX = 0;
    this.target.stickY = 0;
    this.target.left = false;
    this.target.right = false;
    this.target.up = false;
    this.target.down = false;
  }

  private setupButtonEvents(btn: HTMLElement, onPress: () => void, onRelease?: () => void) {
    const handleDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('active');
      btn.setPointerCapture(e.pointerId);
      onPress();
    };

    const handleUp = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove('active');
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        // Ignora se já liberado
      }
      if (onRelease) onRelease();
    };

    btn.addEventListener('pointerdown', handleDown);
    btn.addEventListener('pointerup', handleUp);
    btn.addEventListener('pointercancel', handleUp);
  }
}
