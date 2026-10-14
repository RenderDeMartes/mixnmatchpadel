<?php
// Shared-frame storage for Mix & Match Pádel. PHP 7.4 compatible.
//
// Anyone can publish. Each frame stores a hash of a secret "owner token" that is returned
// only to the device that published it, so only that device can delete it. An optional
// admin key (first non-# line of admin-key.txt) can delete any frame for moderation.
//
// Data (outside the web root):  MM_DATA_DIR/frames.json, rate.json, admin-key.txt
// Images (public):              <docroot>/uploads/<random>.png

class MmError extends Exception
{
    public $status;
    public function __construct($status, $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

const MM_MAX_FRAMES = 100;
const MM_MAX_BYTES = 8 * 1024 * 1024;          // per image
const MM_MAX_TOTAL = 200 * 1024 * 1024;        // all uploaded images together (account quota is 600 MB)
const MM_RATE_MAX = 10;                        // publishes per IP...
const MM_RATE_WINDOW = 3600;                   // ...per this many seconds
const MM_MAX_SIDE = 6000;
const MM_LOGO_TYPES = ['text', 'image', 'none'];
const MM_METALS = ['gold', 'silver', 'bronze', 'steel', 'red'];

function mm_data_dir()
{
    $d = getenv('MM_DATA_DIR');
    return $d ? $d : '/home/reeldemi/mixnmatch-data';
}

function mm_upload_dir()
{
    $d = getenv('MM_UPLOAD_DIR');
    return $d ? $d : dirname(__DIR__) . '/uploads';
}

/** First non-empty line that isn't a # comment. */
function mm_admin_key($dataDir)
{
    $file = $dataDir . '/admin-key.txt';
    if (!is_file($file)) return '';
    foreach (preg_split('/\R/', (string) file_get_contents($file)) as $line) {
        $line = trim($line);
        if ($line !== '' && $line[0] !== '#') return $line;
    }
    return '';
}

/** True only when an admin key (8+ chars) is configured and matches. */
function mm_check_key($dataDir, $given)
{
    $key = mm_admin_key($dataDir);
    return strlen($key) >= 8 && is_string($given) && $given !== '' && hash_equals($key, $given);
}

/** Frames as served to everyone: without the owner hash. */
function mm_public_frames($frames)
{
    $out = [];
    foreach ($frames as $f) {
        unset($f['owner']);
        $out[] = $f;
    }
    return $out;
}

/** Allows MM_RATE_MAX publishes per IP per MM_RATE_WINDOW seconds. */
function mm_rate_limit($dataDir, $ip, $now = null)
{
    $now = $now === null ? time() : $now;
    if (!is_dir($dataDir) && !mkdir($dataDir, 0700, true)) throw new MmError(500, 'No se pudo crear la carpeta de datos.');
    $fh = fopen($dataDir . '/rate.json', 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) throw new MmError(500, 'No se pudo verificar el límite.');
    try {
        $data = json_decode((string) stream_get_contents($fh), true);
        if (!is_array($data)) $data = [];
        $fresh = [];
        foreach ($data as $k => $times) {
            $times = array_values(array_filter((array) $times, function ($t) use ($now) {
                return is_int($t) && $t > $now - MM_RATE_WINDOW;
            }));
            if ($times) $fresh[$k] = $times;
        }
        $k = hash('sha256', (string) $ip);
        $mine = isset($fresh[$k]) ? $fresh[$k] : [];
        if (count($mine) >= MM_RATE_MAX) {
            throw new MmError(429, 'Publicaste muchos marcos seguidos. Intenta de nuevo en un rato.');
        }
        $mine[] = $now;
        $fresh[$k] = $mine;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($fresh));
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

function mm_uploads_size($uploadDir)
{
    $total = 0;
    foreach ((array) glob($uploadDir . '/*.png') as $f) $total += (int) @filesize($f);
    return $total;
}

function mm_read_frames($dataDir)
{
    $file = $dataDir . '/frames.json';
    if (!is_file($file)) return [];
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? array_values($data) : [];
}

/** Runs $fn(frames) -> frames under an exclusive lock and writes the result atomically. */
function mm_update_frames($dataDir, callable $fn)
{
    if (!is_dir($dataDir) && !mkdir($dataDir, 0700, true)) {
        throw new MmError(500, 'No se pudo crear la carpeta de datos.');
    }
    $lock = fopen($dataDir . '/frames.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new MmError(500, 'No se pudo bloquear el archivo de datos.');
    try {
        $frames = $fn(mm_read_frames($dataDir));
        $tmp = $dataDir . '/frames.json.tmp';
        $json = json_encode(array_values($frames), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($json === false || file_put_contents($tmp, $json) === false || !rename($tmp, $dataDir . '/frames.json')) {
            throw new MmError(500, 'No se pudo guardar.');
        }
        return $frames;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function mm_str($v, $fallback, $max)
{
    if (!is_string($v)) return $fallback;
    $v = preg_replace('/[\x00-\x1F\x7F]/u', '', $v);
    return function_exists('mb_substr') ? mb_substr($v, 0, $max, 'UTF-8') : substr($v, 0, $max);
}

function mm_hex($v, $fallback)
{
    return (is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v)) ? strtolower($v) : $fallback;
}

/** Whitelists a design definition; mirrors normalizeDef() in js/frames.js. */
function mm_clean_def($d)
{
    if (!is_array($d)) $d = [];
    $c = isset($d['colors']) && is_array($d['colors']) ? $d['colors'] : [];
    $b = isset($d['badge']) && is_array($d['badge']) ? $d['badge'] : [];
    $k = isset($d['corner']) && is_array($d['corner']) ? $d['corner'] : [];
    $p = isset($d['place']) && is_array($d['place']) ? $d['place'] : [];
    $metal = isset($c['metal']) ? $c['metal'] : 'red';
    if (!in_array($metal, MM_METALS, true)) $metal = mm_hex($metal, 'red');
    $type = function ($v, $fallback) {
        return in_array($v, MM_LOGO_TYPES, true) ? $v : $fallback;
    };
    return [
        'layout' => (isset($d['layout']) && $d['layout'] === 'podium') ? 'podium' : 'classic',
        'colors' => [
            'primary' => mm_hex(isset($c['primary']) ? $c['primary'] : null, '#e10f1a'),
            'bg' => mm_hex(isset($c['bg']) ? $c['bg'] : null, '#060606'),
            'accent' => mm_hex(isset($c['accent']) ? $c['accent'] : null, '#ffffff'),
            'metal' => $metal,
        ],
        'badge' => [
            'type' => $type(isset($b['type']) ? $b['type'] : null, 'text'),
            'line1' => mm_str(isset($b['line1']) ? $b['line1'] : null, 'MIX&', 24),
            'line2' => mm_str(isset($b['line2']) ? $b['line2'] : null, 'MATCH', 24),
            'line3' => mm_str(isset($b['line3']) ? $b['line3'] : null, 'PÁDEL', 24),
        ],
        'corner' => [
            'type' => $type(isset($k['type']) ? $k['type'] : null, 'text'),
            'line1' => mm_str(isset($k['line1']) ? $k['line1'] : null, 'ART', 24),
            'line2' => mm_str(isset($k['line2']) ? $k['line2'] : null, 'P[A]DEL', 24),
            'line3' => mm_str(isset($k['line3']) ? $k['line3'] : null, 'CLUB', 24),
        ],
        'place' => [
            'num' => mm_str(isset($p['num']) ? $p['num'] : null, '1', 4),
            'sup' => mm_str(isset($p['sup']) ? $p['sup'] : null, 'ER', 6),
            'word' => mm_str(isset($p['word']) ? $p['word'] : null, 'LUGAR', 16),
        ],
        'balls' => !(isset($d['balls']) && $d['balls'] === false),
        'seed' => (isset($d['seed']) && is_string($d['seed']) && preg_match('/^[a-z0-9-]{1,32}$/i', $d['seed'])) ? $d['seed'] : null,
    ];
}

const MM_LAYER_TYPES = ['grunge', 'strokes', 'halftone', 'photo', 'logo', 'image', 'ball', 'speed', 'racket', 'net', 'placeBadge', 'title', 'medal', 'nameplate', 'tag', 'ribbon', 'text', 'laurels', 'crown', 'sparkle', 'flare', 'glow', 'bokeh', 'confetti', 'corners', 'ring'];
const MM_MAX_DEF = 400000;   // bytes of layout JSON
const MM_MAX_LAYERS = 150;
const MM_IMAGE_SLOTS = ['img0', 'img1', 'img2', 'img3', 'img4'];

/**
 * Bounds a JSON value: scalars only at the leaves, short strings, limited depth and size.
 * The browser re-validates every prop against its own schema before drawing anything.
 */
function mm_clean_value($v, $depth)
{
    if (is_bool($v) || is_null($v)) return $v;
    if (is_int($v) || is_float($v)) return is_finite($v) ? $v : 0;
    if (is_string($v)) return mm_str($v, '', 200);
    if (is_array($v) && $depth > 0) {
        $out = [];
        $n = 0;
        foreach ($v as $k => $item) {
            if (++$n > 60) break;
            if (is_string($k) && !preg_match('/^[A-Za-z0-9_]{1,24}$/', $k)) continue;
            $out[$k] = mm_clean_value($item, $depth - 1);
        }
        return $out;
    }
    return null;
}

/**
 * Validates a layer-based frame. $images maps slot (img0..img4) => public url of an
 * already-stored PNG; image layers referencing a slot get that url instead.
 */
function mm_clean_layout($raw, $images)
{
    if (!is_string($raw) || strlen($raw) > MM_MAX_DEF) throw new MmError(413, 'El marco es demasiado grande.');
    $d = json_decode($raw, true);
    if (!is_array($d) || !isset($d['layers']) || !is_array($d['layers'])) throw new MmError(400, 'Marco no válido.');
    if (count($d['layers']) > MM_MAX_LAYERS) throw new MmError(400, 'El marco tiene demasiadas piezas.');
    $ratio = isset($d['ratio']) && is_string($d['ratio']) && preg_match('/^(4:5|3:4|1:1|9:16|custom)$/', $d['ratio']) ? $d['ratio'] : '4:5';
    $h = isset($d['H']) && is_numeric($d['H']) ? max(400, min(3000, (int) $d['H'])) : 1350;
    $layers = [];
    foreach ($d['layers'] as $l) {
        if (!is_array($l) || !isset($l['type']) || !in_array($l['type'], MM_LAYER_TYPES, true)) continue;
        $l = mm_clean_value($l, 5);
        if ($l['type'] === 'image') {
            $slot = isset($l['props']['asset']) ? $l['props']['asset'] : null;
            unset($l['props']['asset']);
            if (is_string($slot) && isset($images[$slot])) $l['props']['url'] = $images[$slot];
            elseif (!isset($l['props']['url']) || !is_string($l['props']['url']) || !preg_match('#^uploads/[0-9a-f]{20}\.png$#', $l['props']['url'])) continue;
        } elseif (isset($l['props']) && is_array($l['props'])) {
            unset($l['props']['asset']);
        }
        $layers[] = $l;
    }
    if (!$layers) throw new MmError(400, 'El marco está vacío.');
    return ['v' => 2, 'W' => 1080, 'H' => $h, 'ratio' => $ratio, 'layers' => $layers];
}

/**
 * Validates an uploaded image (must be a real PNG) and stores it under a random name.
 * Re-encodes with GD when available so only clean pixel data is kept.
 * Returns the public relative URL.
 */
function mm_store_png($tmpPath, $uploadDir)
{
    if (!is_file($tmpPath)) throw new MmError(400, 'Archivo no recibido.');
    $size = filesize($tmpPath);
    if ($size <= 0 || $size > MM_MAX_BYTES) throw new MmError(413, 'La imagen es muy pesada (máximo 8 MB).');
    $info = @getimagesize($tmpPath);
    if (!$info || $info[2] !== IMAGETYPE_PNG) throw new MmError(415, 'La imagen tiene que ser PNG.');
    if ($info[0] < 16 || $info[1] < 16 || $info[0] > MM_MAX_SIDE || $info[1] > MM_MAX_SIDE) {
        throw new MmError(415, 'Tamaño de imagen no válido.');
    }
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) throw new MmError(500, 'No se pudo crear la carpeta de imágenes.');

    $name = bin2hex(random_bytes(10)) . '.png';
    $dest = $uploadDir . '/' . $name;
    $ok = false;
    if (function_exists('imagecreatefrompng')) {
        $im = @imagecreatefrompng($tmpPath);
        if ($im) {
            imagealphablending($im, false);
            imagesavealpha($im, true);
            $ok = imagepng($im, $dest, 6);
            imagedestroy($im);
        }
    }
    if (!$ok && !copy($tmpPath, $dest)) throw new MmError(500, 'No se pudo guardar la imagen.');
    @chmod($dest, 0644);
    return 'uploads/' . $name;
}

function mm_delete_files($frame, $uploadDir)
{
    if (empty($frame['files']) || !is_array($frame['files'])) return;
    foreach ($frame['files'] as $url) {
        $base = basename((string) $url);
        if (preg_match('/^[0-9a-f]{20}\.png$/', $base)) @unlink($uploadDir . '/' . $base);
    }
}

/**
 * Creates a frame. $files maps slot (badge|corner|png) => temp path of an already-validated upload.
 * Returns [frame, ownerToken]; only the hash of the token is stored.
 */
function mm_save_frame($dataDir, $uploadDir, $post, $files)
{
    $incoming = 0;
    foreach ($files as $path) $incoming += (int) @filesize($path);
    if (mm_uploads_size($uploadDir) + $incoming > MM_MAX_TOTAL) {
        throw new MmError(507, 'Ya no hay espacio para más marcos. Borra algunos primero.');
    }
    $token = bin2hex(random_bytes(16));

    $kind = isset($post['kind']) && in_array($post['kind'], ['png', 'layout'], true) ? $post['kind'] : 'design';
    $name = trim(mm_str(isset($post['name']) ? $post['name'] : '', '', 40));
    if ($name === '') $name = $kind === 'png' ? 'Marco PNG' : 'Marco';

    $frame = [
        'id' => bin2hex(random_bytes(6)),
        'name' => $name,
        'kind' => $kind,
        'files' => [],
        'created' => time(),
        'owner' => hash('sha256', $token),
    ];

    if ($kind === 'png') {
        if (empty($files['png'])) throw new MmError(400, 'Falta el PNG del marco.');
        $frame['files']['png'] = mm_store_png($files['png'], $uploadDir);
    } elseif ($kind === 'layout') {
        try {
            $images = [];
            foreach (MM_IMAGE_SLOTS as $slot) {
                if (!empty($files[$slot])) $images[$slot] = $frame['files'][$slot] = mm_store_png($files[$slot], $uploadDir);
            }
            $frame['def'] = mm_clean_layout(isset($post['def']) ? $post['def'] : '', $images);
        } catch (Exception $e) {
            mm_delete_files($frame, $uploadDir);
            throw $e;
        }
    } else {
        $def = json_decode(isset($post['def']) ? (string) $post['def'] : '', true);
        $frame['def'] = mm_clean_def($def);
        foreach (['badge', 'corner'] as $slot) {
            if ($frame['def'][$slot]['type'] === 'image') {
                if (empty($files[$slot])) {
                    $frame['def'][$slot]['type'] = 'none';
                } else {
                    $frame['files'][$slot] = mm_store_png($files[$slot], $uploadDir);
                }
            }
        }
    }

    try {
        mm_update_frames($dataDir, function ($frames) use ($frame) {
            if (count($frames) >= MM_MAX_FRAMES) throw new MmError(409, 'Hay demasiados marcos publicados. Borra alguno primero.');
            array_unshift($frames, $frame);
            return $frames;
        });
    } catch (Exception $e) {
        mm_delete_files($frame, $uploadDir);
        throw $e;
    }
    return [$frame, $token];
}

/** Deletes a frame if $token is its owner token, or $isAdmin. */
function mm_delete_frame($dataDir, $uploadDir, $id, $token, $isAdmin)
{
    if (!is_string($id) || !preg_match('/^[0-9a-f]{12}$/', $id)) throw new MmError(400, 'Id no válido.');
    $removed = null;
    mm_update_frames($dataDir, function ($frames) use ($id, $token, $isAdmin, &$removed) {
        $keep = [];
        foreach ($frames as $f) {
            if (isset($f['id']) && $f['id'] === $id) {
                $owns = is_string($token) && $token !== '' && isset($f['owner']) && hash_equals($f['owner'], hash('sha256', $token));
                if (!$owns && !$isAdmin) throw new MmError(403, 'Solo quien publicó este marco lo puede borrar.');
                $removed = $f;
            } else {
                $keep[] = $f;
            }
        }
        return $keep;
    });
    if (!$removed) throw new MmError(404, 'Ese marco ya no existe.');
    mm_delete_files($removed, $uploadDir);
}
