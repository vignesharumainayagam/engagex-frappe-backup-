frappe.provide('frappe.views');

frappe.views.ListView = class ListView extends frappe.views.BaseList {
	static load_last_view() {
		const route = frappe.get_route();
		const doctype = route[1];

		if (route.length === 2) {
			// List/{doctype} => List/{doctype}/{last_view} or List
			const user_settings = frappe.get_user_settings(doctype);
			frappe.set_route('List', doctype, user_settings.last_view || 'List');
			return true;
		}
		return false;
	}

	get view_name() {
		// ListView -> List
		return this.constructor.name.split('View')[0];
	}

	show() {
		this.init().then(() => {
			if (frappe.route_options) {
				this.set_filters_from_route_options();
				return;
			} else {
				this.refresh();
			}
		});
	}

	get view_user_settings() {
		return this.user_settings[this.view_name] || {};
	}

	setup_defaults() {
		super.setup_defaults();
		// initialize with saved filters
		const saved_filters = this.view_user_settings.filters;
		if (saved_filters) {
			this.filters = saved_filters;
		} else {
			// filters in listview_settings
			const filters = (this.settings.filters || []).map(f => {
				if (f.length === 3) {
					f = [this.doctype, f[0], f[1], f[2]];
				}
				return f;
			});

			this.filters = filters;
		}
		// initialize with saved order by
		this.order_by = this.view_user_settings.order_by || 'modified desc';
		// buld menu items)
		this.menu_items = this.menu_items.concat(this.get_menu_items());

		this.patch_refresh_and_load_lib();
	}

	set_fields() {
		let fields = [].concat(
			frappe.model.std_fields_list,
			this.get_fields_in_list_view(),
			[this.meta.title_field, this.meta.image_field],
			(this.settings.add_fields || []),
			this.meta.track_seen ? '_seen' : null,
			'enabled',
			'disabled'
		);

		fields.forEach(f => this._add_field(f));
	}

	patch_refresh_and_load_lib() {
		// throttle refresh for 1s
		this.refresh = this.refresh.bind(this);
		this.refresh = frappe.utils.throttle(this.refresh, 1000);
		this.load_lib = new Promise(resolve => {
			if (this.required_libs) {
				frappe.require(this.required_libs, resolve);
			} else {
				resolve();
			}
		});
		// call refresh every 5 minutes
		const interval = 5 * 60 * 1000;
		setInterval(this.refresh, interval);
	}

	setup_page_head() {
		super.setup_page_head();
		this.set_primary_action();
	}

	set_primary_action() {
		if (this.can_create) {
			this.page.set_primary_action(__('New'), () => {
				this.make_new_doc();
			}, 'octicon octicon-plus');
		} else {
			this.page.clear_primary_action();
		}
	}

	make_new_doc() {
		const doctype = this.doctype;
		const options = {};
		this.filter_area.get().forEach(f => {
			if (f[2] === "=" && frappe.model.is_non_std_field(f[1])) {
				options[f[1]] = f[3];
			}
		});
		frappe.new_doc(doctype, options);
	}

	setup_view() {
		this.setup_columns();
		this.setup_events();
		this.settings.onload && this.settings.onload(this);
	}

	setup_footnote_area() {
		const match_rules_list = frappe.perm.get_match_rules(this.doctype);

		if (match_rules_list.length) {
			this.$footnote_area =
				frappe.utils.set_footnote(this.$footnote_area, this.$frappe_list,
					frappe.render_template('list_permission_footer', {
						condition_list: match_rules_list
					}));
		}
	}

	setup_columns() {
		// setup columns for list view
		this.columns = [];

		const get_df = frappe.meta.get_docfield.bind(null, this.doctype);

		// 1st column: title_field or name
		if (this.meta.title_field) {
			this.columns.push({
				type: 'Subject',
				df: get_df(this.meta.title_field)
			});
		} else {
			this.columns.push({
				type: 'Subject',
				df: {
					label: __('Name'),
					fieldname: 'name'
				}
			});
		}

		// 2nd column: Status indicator
		if (frappe.has_indicator(this.doctype)) {
			// indicator
			this.columns.push({
				type: 'Status'
			});
		}

		const fields_in_list_view = this.get_fields_in_list_view();
		// Add rest from in_list_view docfields
		this.columns = this.columns.concat(
			fields_in_list_view
				.filter(df => {
					if (frappe.has_indicator(this.doctype) && df.fieldname === 'status') {
						return false;
					}
					if (!df.in_list_view) {
						return false;
					}
					return df.fieldname !== this.meta.title_field;
				})
				.map(df => ({
					type: 'Field',
					df
				}))
		);

		// limit to 4 columns
		this.columns = this.columns.slice(0, 4);
	}

	get_no_result_message() {
		const new_button = this.can_create ?
			`<p><button class="btn btn-primary btn-sm btn-new-doc">
				${__('Make a new {0}', [__(this.doctype)])}
			</button></p>` : '';

		return `<div class="msg-box no-border">
			<p>${__('No {0} found', [__(this.doctype)])}</p>
			${new_button}
		</div>`;
	}

	get_args() {
		const args = super.get_args();

		return Object.assign(args, {
			with_comment_count: true
		});
	}

	// freeze(toggle) {
	// 	if (this.view_name !== 'List') return;

	// 	this.$freeze.toggle(toggle);
	// 	this.$result.toggle(!toggle);

	// 	const columns = this.columns;
	// 	if (toggle) {
	// 		if (this.$freeze.find('.freeze-row').length > 0) return;

	// 		const html = `
	// 			${this.get_header_html()}
	// 			${Array.from(new Array(10)).map(loading_row).join('')}
	// 		`;
	// 		this.$freeze.html(html);
	// 	}

	// 	function loading_row() {
	// 		return `
	// 			<div class="list-row freeze-row level">
	// 				<div class="level-left">
	// 					<div class="list-row-col list-subject"></div>
	// 					${columns.slice(1).map(c => `<div class="list-row-col"></div>`).join('')}
	// 				</div>
	// 				<div class="level-right"></div>
	// 			</div>
	// 		`;
	// 	}
	// }

	toggle_result_area() {
		super.toggle_result_area();
		this.toggle_delete_button(
			this.$result.find('.list-row-check:checked').length > 0
		);
	}

	before_render() {
		this.settings.before_render && this.settings.before_render();
		frappe.model.user_settings.save(this.doctype, 'last_view', this.view_name);
		this.save_view_user_settings({
			filters: this.filter_area.get(),
			order_by: this.sort_selector.get_sql_string()
		});
	}

	render() {
		if (this.data.length > 0) {
			const html = `
				${this.get_header_html()}
				${this.data.map(doc => this.get_list_row_html(doc)).join('')}
			`;
			this.$result.html(html);
		}
		this.render_count();
		this.render_tags();
	}

	render_count() {
		this.get_count_html()
			.then(html => {
				this.$result.find('.list-count').html(html);
			});
	}

	render_tags() {
		const $list_rows = this.$result.find('.list-row-container');

		this.data.forEach((d, i) => {
			let tag_html = $(`<div class='tag-row'>
				<div class='list-tag hidden-xs'></div>
			</div>`).appendTo($list_rows.get(i));

			// add tags
			let tag_editor = new frappe.ui.TagEditor({
				parent: tag_html.find('.list-tag'),
				frm: {
					doctype: this.doctype,
					docname: d.name
				},
				list_sidebar: this.list_sidebar,
				user_tags: d._user_tags,
				on_change: function (user_tags) {
					d._user_tags = user_tags;
				}
			});

			tag_editor.wrapper.on('click', '.tagit-label', (e) => {
				const $this = $(e.currentTarget);
				this.filter_area.add(this.doctype, '_user_tags', '=', $this.text());
			});
		});
	}

	get_header_html() {
		const subject_field = this.columns[0].df;
		let subject_html = `
			<input class="level-item list-check-all hidden-xs" type="checkbox" title="${__("Select All")}">
			<span class="level-item list-liked-by-me">
				<i class="octicon octicon-heart text-extra-muted" title="${__("Likes")}"></i>
			</span>
			<span class="level-item">${__(subject_field.label)}</span>
		`;
		const $columns = this.columns.map(col => {
			let classes = [
				'list-row-col ellipsis',
				col.type == 'Subject' ? 'list-subject level' : 'hidden-xs',
				frappe.model.is_numeric_field(col.df) ? 'text-right' : ''
			].join(' ');

			return `
				<div class="${classes}">
					${col.type === 'Subject' ? subject_html : `
					<span>${__(col.df && col.df.label || col.type)}</span>`}
				</div>
			`;
		}).join('');

		return this.get_header_html_skeleton($columns, '<span class="list-count"></span>');
	}

	get_header_html_skeleton(left = '', right = '') {
		return `
			<header class="level list-row list-row-head text-muted small">
				<div class="level-left list-header-subject">
					${left}
				</div>
				<div class="level-left checkbox-actions">
					<div class="level list-subject">
						<input class="level-item list-check-all hidden-xs" type="checkbox" title="${__("Select All")}">
						<span class="level-item list-header-meta"></span>
					</div>
				</div>
				<div class="level-right">
					${right}
				</div>
			</header>
		`;
	}

	get_left_html(doc) {
		return this.columns.map(col => this.get_column_html(col, doc)).join('');
	}

	get_right_html(doc) {
		return this.get_meta_html(doc);
	}

	get_list_row_html(doc) {
		return this.get_list_row_html_skeleton(this.get_left_html(doc), this.get_right_html(doc));
	}

	get_list_row_html_skeleton(left = '', right = '') {
		return `
			<div class="list-row-container">
				<div class="level list-row small">
					<div class="level-left ellipsis">
						${left}
					</div>
					<div class="level-right text-muted ellipsis">
						${right}
					</div>
				</div>
			</div>
		`;
	}

	get_column_html(col, doc) {
		if (col.type === 'Status') {
			return `
				<div class="list-row-col hidden-xs ellipsis">
					${this.get_indicator_html(doc)}
				</div>
			`;
		}

		const df = col.df || {};
		const label = df.label;
		const fieldname = df.fieldname;
		const value = doc[fieldname] || '';

		// listview_setting formatter
		const formatters = this.settings.formatters;

		const format = () => {
			if (formatters && formatters[fieldname]) {
				return formatters[fieldname](value, df, doc);
			} else if (df.fieldtype === 'Code') {
				return value;
			} else {
				return frappe.format(value, df, null, doc);
			}
		};

		const field_html = () => {
			let html;
			const _value = typeof value === 'string' ? frappe.utils.escape_html(value) : value;

			if (df.fieldtype === 'Image') {
				html = df.options ?
					`<img src="${doc[df.options]}" style="max-height: 30px; max-width: 100%;">` :
					`<div class="missing-image small">
						<span class="octicon octicon-circle-slash"></span>
					</div>`;
			} else if (df.fieldtype === 'Select') {
				html = `<span class="filterable indicator ${frappe.utils.guess_colour(_value)} ellipsis"
					data-filter="${fieldname},=,${value}">
					${__(_value)}
				</span>`;
			} else if (df.fieldtype === 'Link') {
				html = `<a class="filterable text-muted ellipsis"
					data-filter="${fieldname},=,${value}">
					${_value}
				</a>`;
			} else if (df.fieldtype === 'Text Editor') {
				html = `<span class="text-muted ellipsis">
					${_value}
				</span>`;
			} else {
				html = `<a class="filterable text-muted ellipsis"
					data-filter="${fieldname},=,${value}">
					${format()}
				</a>`;
			}

			return `<span class="ellipsis"
				title="${__(label) + ': ' + _value}">
				${html}
			</span>`;
		};

		const class_map = {
			Subject: 'list-subject level',
			Field: 'hidden-xs'
		};
		const css_class = [
			'list-row-col ellipsis',
			class_map[col.type],
			frappe.model.is_numeric_field(df) ? 'text-right' : ''
		].join(' ');

		const html_map = {
			Subject: this.get_subject_html(doc),
			Field: field_html()
		};
		const column_html = html_map[col.type];

		return `
			<div class="${css_class}">
				${column_html}
			</div>
		`;
	}

	get_meta_html(doc) {
		let html = '';
		if (doc[this.meta.title_field || ''] !== doc.name) {
			html += `
				<div class="level-item hidden-xs hidden-sm ellipsis">
					<a class="text-muted ellipsis" href="${this.get_form_link(doc)}">
						${doc.name}
					</a>
				</div>
			`;
		}
		const modified = comment_when(doc.modified, true);

		const last_assignee = JSON.parse(doc._assign || '[]').slice(-1)[0];
		const assigned_to = last_assignee ?
			`<span class="filterable"
				data-filter="_assign,like,%${last_assignee}%">
				${frappe.avatar(last_assignee)}
			</span>` :
			`<span class="avatar avatar-small avatar-empty"></span>`;

		const comment_count =
			`<span class="${!doc._comment_count ? 'text-extra-muted' : ''} comment-count">
				<i class="octicon octicon-comment-discussion"></i>
				${doc._comment_count > 99 ? "99+" : doc._comment_count}
			</span>`;

		html += `
			<div class="level-item hidden-xs list-row-activity">
				${modified}
				${assigned_to}
				${comment_count}
			</div>
			<div class="level-item visible-xs text-right">
				${this.get_indicator_dot(doc)}
			</div>
		`;

		return html;
	}

	get_count_html() {
		const current_count = this.data.length;

		return frappe.call({
			type: 'GET',
			method: this.method,
			args: {
				doctype: this.doctype,
				filters: this.get_filters_for_args(),
				fields: [`count(${frappe.model.get_full_column_name('name', this.doctype)}) as total_count`]
			}
		}).then(r => {
			const count = r.message.values[0][0] || current_count;
			const str = __('{0} of {1}', [current_count, count]);
			const html = `<span>${str}</span>`;
			return html;
		});
	}

	get_form_link(doc) {
		const docname = doc.name.match(/[%'"]/)
			? encodeURIComponent(doc.name)
			: doc.name;

		return '#Form/' + this.doctype + '/' + docname;
	}

	get_subject_html(doc) {
		let user = frappe.session.user;
		let subject_field = this.columns[0].df;
		let value = doc[subject_field.fieldname] || doc.name;
		let subject = strip_html(value);
		let escaped_subject = frappe.utils.escape_html(value);

		const liked_by = JSON.parse(doc._liked_by || '[]');
		let heart_class = liked_by.includes(user) ?
			'liked-by' : 'text-extra-muted not-liked';

		const seen = JSON.parse(doc._seen || '[]')
			.includes(user) ? '' : 'bold';

		let subject_html = `
			<input class="level-item list-row-checkbox hidden-xs" type="checkbox" data-name="${doc.name}">
			<span class="level-item" style="margin-bottom: 1px;">
				<i class="octicon octicon-heart like-action ${heart_class}"
					data-name="${doc.name}" data-doctype="${this.doctype}"
					data-liked-by="${encodeURI(doc._liked_by) || '[]'}"
				>
				</i>
				<span class="likes-count">
					${ liked_by.length > 99 ? __("99") + '+' : __(liked_by.length || '')}
				</span>
			</span>
			<span class="level-item ${seen} ellipsis" title="${escaped_subject}">
				<a class="ellipsis" href="${this.get_form_link(doc)}" title="${escaped_subject}">
				${subject}
				</a>
			</span>
		`;

		return subject_html;
	}

	get_indicator_html(doc) {
		const indicator = frappe.get_indicator(doc, this.doctype);
		if (indicator) {
			return `<span class="indicator ${indicator[1]} filterable"
				data-filter='${indicator[2]}'>
				${__(indicator[0])}
			<span>`;
		}
		return '';
	}

	get_indicator_dot(doc) {
		const indicator = frappe.get_indicator(doc, this.doctype);
		if (!indicator) return '';
		return `<span class='indicator ${indicator[1]}' title='${__(indicator[0])}'></span>`;
	}

	setup_events() {
		// filterable events
		this.$result.on('click', '.filterable', e => {
			if (e.metaKey || e.ctrlKey) return;
			e.stopPropagation();
			const $this = $(e.currentTarget);
			const filters = $this.attr('data-filter').split('|');

			const filters_to_apply = filters.map(f => {
				f = f.split(',');
				if (f[2] === 'Today') {
					f[2] = frappe.datetime.get_today();
				} else if (f[2] == 'User') {
					f[2] = frappe.session.user;
				}
				return [this.doctype, f[0], f[1], f.slice(2).join(',')];
			});
			this.filter_area.add(filters_to_apply);
		});

		this.$result.on('click', '.list-row', (e) => {
			const $target = $(e.target);

			// tick checkbox if Ctrl/Meta key is pressed
			if (e.ctrlKey || e.metaKey && !$target.is('a')) {
				const $list_row = $(e.currentTarget);
				const $check = $list_row.find('.list-row-checkbox');
				$check.prop('checked', !$check.prop('checked'));
				e.preventDefault();
				this.on_row_checked();
				return;
			}

			// don't open form when checkbox, like, filterable are clicked
			if ($target.hasClass('filterable') ||
				$target.hasClass('octicon-heart') ||
				$target.is(':checkbox') ||
				$target.is('a')
			) {
				return;
			}

			// open form
			const $row = $(e.currentTarget);
			const link = $row.find('.list-subject a').get(0);
			if (link) {
				window.location.href = link.href;
				return false;
			}
		});

		// toggle tags
		this.list_sidebar.parent.on('click', '.list-tag-preview', () => {
			this.toggle_tags();
		});

		this.$no_result.find('.btn-new-doc').click(() => this.make_new_doc());

		this.setup_check_events();
		this.setup_like();
	}

	setup_check_events() {
		this.$result.on('change', 'input[type=checkbox]', e => {
			const $target = $(e.currentTarget);

			if ($target.is('.list-header-subject .list-check-all')) {
				const $check = this.$result.find('.checkbox-actions .list-check-all');
				$check.prop('checked', $target.prop('checked'));
				$check.trigger('change');
			} else if ($target.is('.checkbox-actions .list-check-all')) {
				const $check = this.$result.find('.list-header-subject .list-check-all');
				$check.prop('checked', $target.prop('checked'));

				this.$result.find('.list-row-checkbox')
					.prop('checked', $target.prop('checked'));
			}

			this.on_row_checked();
		});

		this.$result.on('click', '.list-row-checkbox', e => {
			const $target = $(e.currentTarget);

			// shift select checkboxes
			if (e.shiftKey && this.$checkbox_cursor && !$target.is(this.$checkbox_cursor)) {
				const name_1 = this.$checkbox_cursor.data().name;
				const name_2 = $target.data().name;
				const index_1 = this.data.findIndex(d => d.name === name_1);
				const index_2 = this.data.findIndex(d => d.name === name_2);
				let [min_index, max_index] = [index_1, index_2];

				if (min_index > max_index) {
					[min_index, max_index] = [max_index, min_index];
				}

				let docnames = this.data.slice(min_index + 1, max_index).map(d => d.name);
				const selector = docnames.map(name => `.list-row-checkbox[data-name="${name}"]`).join(',');
				this.$result.find(selector).prop('checked', true);
			}

			this.$checkbox_cursor = $target;
		});
	}

	setup_like() {
		this.$result.on('click', '.like-action', frappe.ui.click_toggle_like);
		this.$result.on('click', '.list-liked-by-me', e => {
			const $this = $(e.currentTarget);
			$this.toggleClass('active');

			if ($this.hasClass('active')) {
				this.filter_area.add(this.doctype, '_liked_by', 'like', '%' + frappe.session.user + '%');
			} else {
				this.filter_area.remove('_liked_by');
			}
		});

		frappe.ui.setup_like_popover(this.$result, '.liked-by');
	}

	on_row_checked() {
		this.$list_head_subject = this.$list_head_subject || this.$result.find('header .list-header-subject');
		this.$checkbox_actions = this.$checkbox_actions || this.$result.find('header .checkbox-actions');

		this.$checks = this.$result.find('.list-row-checkbox:checked');

		this.$list_head_subject.toggle(this.$checks.length === 0);
		this.$checkbox_actions.toggle(this.$checks.length > 0);

		if (this.$checks.length === 0) {
			this.$list_head_subject.find('.list-select-all').prop('checked', false);
		} else {
			this.$checkbox_actions.find('.list-header-meta').html(
				__('{0} items selected', [this.$checks.length])
			);
			this.$checkbox_actions.show();
			this.$list_head_subject.hide();
		}

		if (this.can_delete) {
			this.toggle_delete_button(this.$checks.length > 0);
		}
	}

	toggle_delete_button(toggle) {
		if (toggle) {
			this.page.set_primary_action(__('Delete'),
				() => this.delete_items(),
				'octicon octicon-trashcan'
			).addClass('btn-danger');
		} else {
			this.page.btn_primary.removeClass('btn-danger');
			this.set_primary_action();
		}
	}

	toggle_tags() {
		this.$result.toggleClass('tags-shown');
	}

	delete_items() {
		const docnames = this.get_checked_items(true);

		frappe.confirm(__('Delete {0} items permanently?', [docnames.length]),
			() => {
				frappe.call({
					method: 'frappe.desk.reportview.delete_items',
					freeze: true,
					args: {
						items: docnames,
						doctype: this.doctype
					}
				}).then((r) => {
					let failed = r.message;
					if (!failed) failed = [];

					if (failed.length && !r._server_messages) {
						frappe.throw(__('Cannot delete {0}', [failed.map(f => f.bold()).join(', ')]));
					}
					if (failed.length < docnames.length) {
						frappe.utils.play_sound('delete');
						this.refresh(true);
					}
				});
			}
		);
	}

	get_checked_items(only_docnames) {
		const docnames = Array.from(this.$checks || [])
			.map(check => $(check).data().name);

		if (only_docnames) return docnames;

		return this.data.filter(d => docnames.includes(d.name));
	}

	save_view_user_settings(obj) {
		return frappe.model.user_settings.save(this.doctype, this.view_name, obj);
	}

	on_update(data) {
		if (data.doctype === this.doctype) {
			this.refresh();
		}
	}

	get_menu_items() {
		const doctype = this.doctype;
		const items = [];

		if (frappe.model.can_import(doctype)) {
			items.push({
				label: __('Import'),
				action: () => frappe.set_route('List', 'Data Import', {
					reference_doctype: doctype
				}),
				standard: true
			});
		}
		if (frappe.model.can_set_user_permissions(doctype)) {
			items.push({
				label: __('User Permissions'),
				action: () => frappe.set_route('List', 'User Permission', {
					allow: doctype
				}),
				standard: true
			});
		}
		if (frappe.user_roles.includes('System Manager')) {
			items.push({
				label: __('Role Permissions Manager'),
				action: () => frappe.set_route('permission-manager', {
					doctype
				}),
				standard: true
			});

			items.push({
				label: __('Customize'),
				action: () => frappe.set_route('Form', 'Customize Form', {
					doc_type: doctype
				}),
				standard: true
			});
		}

		items.push({
			label: __('Toggle Sidebar'),
			action: () => this.toggle_side_bar(),
			standard: true
		});

		// utility
		const bulk_assignment = () => {
			return {
				label: __('Assign To'),
				action: () => {
					const docnames = this.get_checked_items(true);
					if (docnames.length > 0) {
						const dialog = new frappe.ui.form.AssignToDialog({
							obj: this,
							method: 'frappe.desk.form.assign_to.add_multiple',
							doctype: this.doctype,
							docname: docnames,
							bulk_assign: true,
							re_assign: true,
							callback: () => this.refresh(true)
						});
						dialog.clear();
						dialog.show();
					} else {
						frappe.msgprint(__('Select records for assignment'));
					}
				},
				standard: true
			};
		};

		const bulk_printing = () => {
			const print_settings = frappe.model.get_doc(':Print Settings', 'Print Settings');
			const allow_print_for_draft = cint(print_settings.allow_print_for_draft);
			const is_submittable = frappe.model.is_submittable(this.doctype);
			const allow_print_for_cancelled = cint(print_settings.allow_print_for_cancelled);

			return {
				label: __('Print'),
				action: () => {
					const items = this.get_checked_items();

					const valid_docs = items.filter(doc => {
						return !is_submittable || doc.docstatus === 1 ||
							(allow_print_for_cancelled && doc.docstatus == 2) ||
							(allow_print_for_draft && doc.docstatus == 0) ||
							frappe.user.has_role('Administrator');
					}).map(doc => doc.name);

					var invalid_docs = items.filter(doc => !valid_docs.includes(doc.name));

					if (invalid_docs.length > 0) {
						frappe.msgprint(__('You selected Draft or Cancelled documents'));
						return;
					}

					if (valid_docs.length > 0) {
						const dialog = new frappe.ui.Dialog({
							title: __('Print Documents'),
							fields: [{
								'fieldtype': 'Check',
								'label': __('With Letterhead'),
								'fieldname': 'with_letterhead'
							},
							{
								'fieldtype': 'Select',
								'label': __('Print Format'),
								'fieldname': 'print_sel',
								options: frappe.meta.get_print_formats(this.doctype)
							}]
						});

						dialog.set_primary_action(__('Print'), args => {
							if (!args) return;
							const default_print_format = frappe.get_meta(this.doctype).default_print_format;
							const with_letterhead = args.with_letterhead ? 1 : 0;
							const print_format = args.print_sel ? args.print_sel : default_print_format;
							const json_string = JSON.stringify(valid_docs);

							const w = window.open('/api/method/frappe.utils.print_format.download_multi_pdf?' +
								'doctype=' + encodeURIComponent(this.doctype) +
								'&name=' + encodeURIComponent(json_string) +
								'&format=' + encodeURIComponent(print_format) +
								'&no_letterhead=' + (with_letterhead ? '0' : '1'));
							if (!w) {
								frappe.msgprint(__('Please enable pop-ups'));
								return;
							}
						});

						dialog.show();
					} else {
						frappe.msgprint(__('Select atleast 1 record for printing'));
					}
				},
				standard: true
			};
		};

		// bulk assignment
		items.push(bulk_assignment());

		if (frappe.model.can_print(doctype)) {
			items.push(bulk_printing());
		}

		// add to desktop
		items.push({
			label: __('Add to Desktop'),
			action: () => frappe.add_to_desktop(doctype, doctype),
			standard: true
		});

		if (frappe.user.has_role('System Manager') && frappe.boot.developer_mode === 1) {
			// edit doctype
			items.push({
				label: __('Edit DocType'),
				action: () => frappe.set_route('Form', 'DocType', doctype),
				standard: true
			});
		}

		return items;
	}

	set_filters_from_route_options() {
		const filters = [];
		for (let field in frappe.route_options) {
			var value = frappe.route_options[field];
			var doctype = null;

			// if `Child DocType.fieldname`
			if (field.includes('.')) {
				doctype = field.split('.')[0];
				field = field.split('.')[1];
			}

			// find the table in which the key exists
			// for example the filter could be {"item_code": "X"}
			// where item_code is in the child table.

			// we can search all tables for mapping the doctype
			if (!doctype) {
				doctype = frappe.meta.get_doctype_for_field(this.doctype, field);
			}

			if (doctype) {
				if ($.isArray(value)) {
					filters.push([doctype, field, value[0], value[1]]);
				} else {
					filters.push([doctype, field, "=", value]);
				}
			}
		}
		frappe.route_options = null;

		this.filter_area.add(filters);
	}

	static trigger_list_update(data) {
		const doctype = data.doctype;
		if (!doctype) return;
		frappe.provide('frappe.views.trees');

		// refresh tree view
		if (frappe.views.trees[doctype]) {
			frappe.views.trees[doctype].tree.refresh();
			return;
		}

		// refresh list view
		const page_name = frappe.get_route_str();
		const list_view = frappe.views.list_view[page_name];
		list_view && list_view.on_update(data);
	}
};

$(document).on('save', function (event, doc) {
	frappe.views.ListView.trigger_list_update(doc);
});