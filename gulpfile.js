const { src, dest, series } = require('gulp');

function buildIcons() {
	return src('nodes/**/*.{png,svg}').pipe(dest('dist/nodes'));
}

function copyEndpointIndex() {
	return src('resources/glpi-endpoints-index.json').pipe(dest('dist/nodes/Glpi/resources'));
}

exports['build:icons'] = series(buildIcons, copyEndpointIndex);
