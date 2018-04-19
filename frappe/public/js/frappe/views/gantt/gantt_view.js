frappe.provide('frappe.views');

frappe.views.GanttView = class GanttView extends frappe.views.ListView {

	setup_defaults() {
		super.setup_defaults();
		this.page_title = this.page_title + ' ' + __('Gantt');
		this.calendar_settings = frappe.views.calendar[this.doctype] || {};
		this.order_by = this.view_user_settings.order_by || this.calendar_settings.field_map.start + ' asc';
	}

	setup_view() {
		this.$result
			.css('overflow', 'auto')
			.append('<svg class="gantt-container" width="20" height="20"></svg>');
	}

	prepare_data(data) {
		super.prepare_data(data);
		this.prepare_tasks();
	}

	prepare_tasks() {
		var me = this;
		var meta = this.meta;
		var field_map = this.calendar_settings.field_map;

		this.tasks = this.data.map(function (item) {
			// set progress
			var progress = 0;
			if (field_map.progress && $.isFunction(field_map.progress)) {
				progress = field_map.progress(item);
			} else if (field_map.progress) {
				progress = item[field_map.progress];
			}

			// title
			var label;
			if (meta.title_field) {
				label = $.format("{0} ({1})", [item[meta.title_field], item.name]);
			} else {
				label = item[field_map.title];
			}

			var r = {
				start: item[field_map.start],
				end: item[field_map.end],
				name: label,
				id: item[field_map.id || 'name'],
				doctype: me.doctype,
				progress: progress,
				dependencies: item.depends_on_tasks || ""
			};

			if (item.color && frappe.ui.color.validate_hex(item.color)) {
				r['custom_class'] = 'color-' + item.color.substr(1);
			}

			if (item.is_milestone) {
				r['custom_class'] = 'bar-milestone';
			}

			return r;
		});
	}

	render() {
		this.load_lib.then(() => {
			this.render_gantt();
		});
	}

	render_gantt() {
		const me = this;
		const gantt_view_mode = this.view_user_settings.gantt_view_mode || 'Day';
		const field_map = this.calendar_settings.field_map;
		const date_format = 'YYYY-MM-DD';

		this.gantt = new Gantt(".gantt-container", this.tasks, {
			view_mode: gantt_view_mode,
			date_format: "YYYY-MM-DD",
			on_click: function (task) {
				frappe.set_route('Form', task.doctype, task.id);
			},
			on_date_change: function (task, start, end) {
				if (!me.can_write) return;
				frappe.db.set_value(task.doctype, task.id, {
					[field_map.start]: start.format(date_format),
					[field_map.end]: end.format(date_format)
				});
			},
			on_progress_change: function (task, progress) {
				if (!me.can_write) return;
				var progress_fieldname = 'progress';

				if ($.isFunction(field_map.progress)) {
					progress_fieldname = null;
				} else if (field_map.progress) {
					progress_fieldname = field_map.progress;
				}

				if (progress_fieldname) {
					frappe.db.set_value(task.doctype, task.id, {
						[progress_fieldname]: parseInt(progress)
					});
				}
			},
			on_view_change: function (mode) {
				// save view mode
				me.save_view_user_settings({
					gantt_view_mode: mode
				});
			},
			custom_popup_html: function (task) {
				var item = me.get_item(task.id);

				var html =
					`<h5>${task.name}</h5>
					<p>${task._start.format('MMM D')} - ${task._end.format('MMM D')}</p>`;

				// custom html in doctype settings
				var custom = me.settings.gantt_custom_popup_html;
				if (custom && $.isFunction(custom)) {
					var ganttobj = task;
					html = custom(ganttobj, item);
				}
				return '<div class="details-container">' + html + '</div>';
			}
		});
		this.setup_view_mode_buttons();
		this.set_colors();
	}

	setup_view_mode_buttons() {
		// view modes (for translation) __("Day"), __("Week"), __("Month"),
		//__("Half Day"), __("Quarter Day")

		let $btn_group = this.$paging_area.find('.gantt-view-mode');
		if ($btn_group.length > 0) return;

		const view_modes = this.gantt.config.view_modes || [];
		const active_class = view_mode => this.gantt.view_is(view_mode) ? 'btn-info' : '';
		const html =
			`<div class="btn-group gantt-view-mode">
				${view_modes.map(value => `<button type="button"
						class="btn btn-default btn-sm btn-view-mode ${active_class(value)}"
						data-value="${value}">
						${__(value)}
					</button>`).join('')}
			</div>`;

		this.$paging_area.find('.level-left').append(html);

		// change view mode asynchronously
		const change_view_mode = (value) => setTimeout(() => this.gantt.change_view_mode(value), 0);

		this.$paging_area.on('click', '.btn-view-mode', e => {
			const $btn = $(e.currentTarget);
			this.$paging_area.find('.btn-view-mode').removeClass('btn-info');
			$btn.addClass('btn-info');

			const value = $btn.data().value;
			change_view_mode(value);
		});
	}

	set_colors() {
		const classes = this.tasks
			.map(t => t.custom_class)
			.filter(c => c && c.startsWith('color-'));

		let style = classes.map(c => {
			const class_name = c.replace('#', '');
			const bar_color = '#' + c.substr(6);
			const progress_color = frappe.ui.color.get_contrast_color(bar_color);
			return `
				.gantt .bar-wrapper.${class_name} .bar {
					fill: ${bar_color};
				}
				.gantt .bar-wrapper.${class_name} .bar-progress {
					fill: ${progress_color};
				}
			`;
		}).join("");

		style = `<style>${style}</style>`;
		this.$result.prepend(style);
	}

	get_item(name) {
		return this.data.find(function (item) {
			return item.name === name;
		});
	}

	get required_libs() {
		return [
			"assets/frappe/js/lib/snap.svg-min.js",
			"assets/frappe/js/lib/frappe-gantt/frappe-gantt.js"
		];
	}
};
