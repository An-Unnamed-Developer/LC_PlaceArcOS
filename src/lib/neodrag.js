(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.NeoDrag = {}));
})(this, (function (exports) { 'use strict';

  // ../core/dist/index.js
  var DEFAULT_RECOMPUTE_BOUNDS = {
    dragStart: true
  };
  var DEFAULT_DRAG_THRESHOLD = {
    delay: 0,
    distance: 3
    /* DISTANCE */
  };
  function draggable(node, options = {}) {
    let {
      bounds,
      axis = "both",
      gpuAcceleration = true,
      legacyTranslate = false,
      transform,
      applyUserSelectHack = true,
      disabled = false,
      ignoreMultitouch = false,
      recomputeBounds = DEFAULT_RECOMPUTE_BOUNDS,
      grid,
      threshold = DEFAULT_DRAG_THRESHOLD,
      position,
      cancel,
      handle,
      defaultClass = "neodrag",
      defaultClassDragging = "neodrag-dragging",
      defaultClassDragged = "neodrag-dragged",
      defaultPosition = { x: 0, y: 0 },
      onDragStart,
      onDrag,
      onDragEnd
    } = options;
    let is_interacting = false;
    let is_dragging = false;
    let start_time = 0;
    let meets_time_threshold = false;
    let meets_distance_threshold = false;
    let translate_x = 0, translate_y = 0;
    let initial_x = 0, initial_y = 0;
    let client_to_node_offsetX = 0, client_to_node_offsetY = 0;
    let { x: x_offset, y: y_offset } = position ? { x: position?.x ?? 0, y: position?.y ?? 0 } : defaultPosition;
    set_translate(x_offset, y_offset);
    let can_move_in_x;
    let can_move_in_y;
    let body_original_user_select_val = "";
    let computed_bounds;
    let node_rect;
    let drag_els;
    let cancel_els;
    let currently_dragged_el;
    let is_controlled = !!position;
    recomputeBounds = { ...DEFAULT_RECOMPUTE_BOUNDS, ...recomputeBounds };
    threshold = { ...DEFAULT_DRAG_THRESHOLD, ...threshold ?? {} };
    let active_pointers = /* @__PURE__ */ new Set();
    function try_start_drag(event) {
      if (is_interacting && !is_dragging && meets_distance_threshold && meets_time_threshold && currently_dragged_el) {
        is_dragging = true;
        fire_svelte_drag_start_event(event);
        node_class_list.add(defaultClassDragging);
        if (applyUserSelectHack) {
          body_original_user_select_val = body_style.userSelect;
          body_style.userSelect = "none";
        }
      }
    }
    function reset_state() {
      is_dragging = false;
      meets_time_threshold = false;
      meets_distance_threshold = false;
    }
    const body_style = document.body.style;
    const node_class_list = node.classList;
    function set_translate(x_pos = translate_x, y_pos = translate_y) {
      if (!transform) {
        if (legacyTranslate) {
          let common = `${+x_pos}px, ${+y_pos}px`;
          return set_style(
            node,
            "transform",
            gpuAcceleration ? `translate3d(${common}, 0)` : `translate(${common})`
          );
        }
        return set_style(node, "translate", `${+x_pos}px ${+y_pos}px`);
      }
      const transform_called = transform({ offsetX: x_pos, offsetY: y_pos, rootNode: node });
      if (is_string(transform_called)) {
        set_style(node, "transform", transform_called);
      }
    }
    function get_event_data(event) {
      return {
        offsetX: translate_x,
        offsetY: translate_y,
        rootNode: node,
        currentNode: currently_dragged_el,
        event
      };
    }
    function call_event(eventName, fn, event) {
      const data = get_event_data(event);
      node.dispatchEvent(new CustomEvent(eventName, { detail: data }));
      fn?.(data);
    }
    function fire_svelte_drag_start_event(event) {
      call_event("neodrag:start", onDragStart, event);
    }
    function fire_svelte_drag_end_event(event) {
      call_event("neodrag:end", onDragEnd, event);
    }
    function fire_svelte_drag_event(event) {
      call_event("neodrag", onDrag, event);
    }
    const listen = addEventListener;
    const controller = new AbortController();
    const event_options = { signal: controller.signal, capture: false };
    set_style(node, "touch-action", "none");
    listen(
      "pointerdown",
      (e) => {
        if (disabled) return;
        if (e.button === 2) return;
        active_pointers.add(e.pointerId);
        if (ignoreMultitouch && active_pointers.size > 1) return e.preventDefault();
        if (recomputeBounds.dragStart) computed_bounds = compute_bound_rect(bounds, node);
        if (is_string(handle) && is_string(cancel) && handle === cancel)
          throw new Error("`handle` selector can't be same as `cancel` selector");
        node_class_list.add(defaultClass);
        drag_els = get_handle_els(handle, node);
        cancel_els = get_cancel_elements(cancel, node);
        can_move_in_x = /(both|x)/.test(axis);
        can_move_in_y = /(both|y)/.test(axis);
        if (cancel_element_contains(cancel_els, drag_els))
          throw new Error(
            "Element being dragged can't be a child of the element on which `cancel` is applied"
          );
        const event_target = e.composedPath()[0];
        if (drag_els.some((el) => el.contains(event_target) || el.shadowRoot?.contains(event_target)) && !cancel_element_contains(cancel_els, [event_target])) {
          currently_dragged_el = drag_els.length === 1 ? node : drag_els.find((el) => el.contains(event_target));
          is_interacting = true;
          start_time = Date.now();
          if (!threshold.delay) {
            meets_time_threshold = true;
          }
        } else return;
        node_rect = node.getBoundingClientRect();
        const { clientX, clientY } = e;
        const inverse_scale = calculate_inverse_scale();
        if (can_move_in_x) initial_x = clientX - x_offset / inverse_scale;
        if (can_move_in_y) initial_y = clientY - y_offset / inverse_scale;
        if (computed_bounds) {
          client_to_node_offsetX = clientX - node_rect.left;
          client_to_node_offsetY = clientY - node_rect.top;
        }
      },
      event_options
    );
    listen(
      "pointermove",
      (e) => {
        if (!is_interacting || ignoreMultitouch && active_pointers.size > 1) return;
        if (!is_dragging) {
          if (!meets_time_threshold) {
            const elapsed = Date.now() - start_time;
            if (elapsed >= threshold.delay) {
              meets_time_threshold = true;
              try_start_drag(e);
            }
          }
          if (!meets_distance_threshold) {
            const delta_x = e.clientX - initial_x;
            const delta_y = e.clientY - initial_y;
            const distance = Math.sqrt(delta_x ** 2 + delta_y ** 2);
            if (distance >= threshold.distance) {
              meets_distance_threshold = true;
              try_start_drag(e);
            }
          }
          if (!is_dragging) return;
        }
        if (recomputeBounds.drag) computed_bounds = compute_bound_rect(bounds, node);
        e.preventDefault();
        node_rect = node.getBoundingClientRect();
        let final_x = e.clientX, final_y = e.clientY;
        const inverse_scale = calculate_inverse_scale();
        if (computed_bounds) {
          const virtual_client_bounds = {
            left: computed_bounds.left + client_to_node_offsetX,
            top: computed_bounds.top + client_to_node_offsetY,
            right: computed_bounds.right + client_to_node_offsetX - node_rect.width,
            bottom: computed_bounds.bottom + client_to_node_offsetY - node_rect.height
          };
          final_x = clamp(final_x, virtual_client_bounds.left, virtual_client_bounds.right);
          final_y = clamp(final_y, virtual_client_bounds.top, virtual_client_bounds.bottom);
        }
        if (Array.isArray(grid)) {
          let [x_snap, y_snap] = grid;
          if (isNaN(+x_snap) || x_snap < 0)
            throw new Error("1st argument of `grid` must be a valid positive number");
          if (isNaN(+y_snap) || y_snap < 0)
            throw new Error("2nd argument of `grid` must be a valid positive number");
          let delta_x = final_x - initial_x, delta_y = final_y - initial_y;
          [delta_x, delta_y] = snap_to_grid(
            [x_snap / inverse_scale, y_snap / inverse_scale],
            delta_x,
            delta_y
          );
          final_x = initial_x + delta_x;
          final_y = initial_y + delta_y;
        }
        if (can_move_in_x) translate_x = Math.round((final_x - initial_x) * inverse_scale);
        if (can_move_in_y) translate_y = Math.round((final_y - initial_y) * inverse_scale);
        x_offset = translate_x;
        y_offset = translate_y;
        fire_svelte_drag_event(e);
        set_translate();
      },
      event_options
    );
    listen(
      "pointerup",
      (e) => {
        active_pointers.delete(e.pointerId);
        if (!is_interacting) return;
        if (is_dragging) {
          listen("click", (e2) => e2.stopPropagation(), {
            once: true,
            signal: controller.signal,
            capture: true
          });
          if (recomputeBounds.dragEnd) computed_bounds = compute_bound_rect(bounds, node);
          node_class_list.remove(defaultClassDragging);
          node_class_list.add(defaultClassDragged);
          if (applyUserSelectHack) body_style.userSelect = body_original_user_select_val;
          fire_svelte_drag_end_event(e);
          if (can_move_in_x) initial_x = translate_x;
          if (can_move_in_y) initial_y = translate_y;
        }
        is_interacting = false;
        reset_state();
      },
      event_options
    );
    function calculate_inverse_scale() {
      let inverse_scale = node.offsetWidth / node_rect.width;
      if (isNaN(inverse_scale)) inverse_scale = 1;
      return inverse_scale;
    }
    return {
      destroy: () => controller.abort(),
      update: (options2) => {
        axis = options2.axis || "both";
        disabled = options2.disabled ?? false;
        ignoreMultitouch = options2.ignoreMultitouch ?? false;
        handle = options2.handle;
        bounds = options2.bounds;
        recomputeBounds = options2.recomputeBounds ?? DEFAULT_RECOMPUTE_BOUNDS;
        cancel = options2.cancel;
        applyUserSelectHack = options2.applyUserSelectHack ?? true;
        grid = options2.grid;
        gpuAcceleration = options2.gpuAcceleration ?? true;
        legacyTranslate = options2.legacyTranslate ?? true;
        transform = options2.transform;
        threshold = { ...DEFAULT_DRAG_THRESHOLD, ...options2.threshold ?? {} };
        const dragged = node_class_list.contains(defaultClassDragged);
        node_class_list.remove(defaultClass, defaultClassDragged);
        defaultClass = options2.defaultClass ?? "neodrag";
        defaultClassDragging = options2.defaultClassDragging ?? "neodrag-dragging";
        defaultClassDragged = options2.defaultClassDragged ?? "neodrag-dragged";
        node_class_list.add(defaultClass);
        if (dragged) node_class_list.add(defaultClassDragged);
        if (is_controlled) {
          x_offset = translate_x = options2.position?.x ?? translate_x;
          y_offset = translate_y = options2.position?.y ?? translate_y;
          set_translate();
        }
      }
    };
  }
  var clamp = (val, min, max) => Math.min(Math.max(val, min), max);
  var is_string = (val) => typeof val === "string";
  var snap_to_grid = ([x_snap, y_snap], pending_x, pending_y) => {
    const calc = (val, snap) => snap === 0 ? 0 : Math.ceil(val / snap) * snap;
    const x = calc(pending_x, x_snap);
    const y = calc(pending_y, y_snap);
    return [x, y];
  };
  function get_handle_els(handle, node) {
    if (!handle) return [node];
    if (is_HTMLElement(handle)) return [handle];
    if (Array.isArray(handle)) return handle;
    const handle_els = node.querySelectorAll(handle);
    if (handle_els === null)
      throw new Error(
        "Selector passed for `handle` option should be child of the element on which the action is applied"
      );
    return Array.from(handle_els.values());
  }
  function get_cancel_elements(cancel, node) {
    if (!cancel) return [];
    if (is_HTMLElement(cancel)) return [cancel];
    if (Array.isArray(cancel)) return cancel;
    const cancel_els = node.querySelectorAll(cancel);
    if (cancel_els === null)
      throw new Error(
        "Selector passed for `cancel` option should be child of the element on which the action is applied"
      );
    return Array.from(cancel_els.values());
  }
  var cancel_element_contains = (cancel_elements, drag_elements) => cancel_elements.some((cancelEl) => drag_elements.some((el) => cancelEl.contains(el)));
  function compute_bound_rect(bounds, rootNode) {
    if (bounds === void 0) return;
    if (is_HTMLElement(bounds)) return bounds.getBoundingClientRect();
    if (typeof bounds === "object") {
      const { top = 0, left = 0, right = 0, bottom = 0 } = bounds;
      const computed_right = window.innerWidth - right;
      const computed_bottom = window.innerHeight - bottom;
      return { top, right: computed_right, bottom: computed_bottom, left };
    }
    if (bounds === "parent") return rootNode.parentNode.getBoundingClientRect();
    const node = document.querySelector(bounds);
    if (node === null)
      throw new Error("The selector provided for bound doesn't exists in the document.");
    return node.getBoundingClientRect();
  }
  var set_style = (el, style, value) => el.style.setProperty(style, value);
  var is_HTMLElement = (obj) => obj instanceof HTMLElement;

  // src/index.ts
  var Draggable = class {
    constructor(node, options = {}) {
      this.node = node;
      this._drag_instance = draggable(node, this._options = options);
    }
    _drag_instance;
    _options = {};
    updateOptions(options) {
      this._drag_instance.update(Object.assign(this._options, options));
    }
    set options(options) {
      this._drag_instance.update(this._options = options);
    }
    get options() {
      return this._options;
    }
    destroy() {
      this._drag_instance.destroy();
    }
  };

  exports.Draggable = Draggable;

}));